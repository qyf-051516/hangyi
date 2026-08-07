package com.qyf.hangyi.assistant.repository;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.qyf.hangyi.assistant.dto.ChatResponse;
import com.qyf.hangyi.assistant.dto.Citation;
import com.qyf.hangyi.assistant.service.AssistantIdentity;
import com.qyf.hangyi.common.exception.BusinessException;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class AssistantRepository {

    private static final TypeReference<List<Citation>> CITATION_LIST =
            new TypeReference<>() { };

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public AssistantRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public int consumeQuota(AssistantIdentity identity, int dailyLimit) {
        LocalDate today = LocalDate.now();
        try {
            jdbcTemplate.update("""
                    INSERT INTO assistant_daily_quota
                        (channel, subject, quota_date, request_count, created_at, updated_at)
                    VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    """, identity.channel(), identity.subject(), today);
        } catch (DuplicateKeyException ignored) {
            // 同一账号同一天只创建一条计数记录，并发插入由主键保证幂等。
        }
        int updated = jdbcTemplate.update("""
                UPDATE assistant_daily_quota
                SET request_count = request_count + 1, updated_at = CURRENT_TIMESTAMP
                WHERE channel = ? AND subject = ? AND quota_date = ?
                  AND request_count < ?
                """, identity.channel(), identity.subject(), today, dailyLimit);
        if (updated != 1) {
            throw new BusinessException(429, "今日智能问答次数已用完");
        }
        Integer used = jdbcTemplate.queryForObject("""
                SELECT request_count
                FROM assistant_daily_quota
                WHERE channel = ? AND subject = ? AND quota_date = ?
                """, Integer.class, identity.channel(), identity.subject(), today);
        return Math.max(0, dailyLimit - (used == null ? dailyLimit : used));
    }

    public void refundQuota(AssistantIdentity identity) {
        jdbcTemplate.update("""
                UPDATE assistant_daily_quota
                SET request_count = CASE
                        WHEN request_count > 0 THEN request_count - 1
                        ELSE 0
                    END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE channel = ? AND subject = ? AND quota_date = ?
                """, identity.channel(), identity.subject(), LocalDate.now());
    }

    public String resolveSession(AssistantIdentity identity, String requestedSessionId) {
        if (requestedSessionId != null && !requestedSessionId.isBlank()) {
            Integer owned = jdbcTemplate.queryForObject("""
                    SELECT COUNT(*)
                    FROM assistant_session
                    WHERE id = ? AND channel = ? AND subject = ?
                    """, Integer.class, requestedSessionId, identity.channel(), identity.subject());
            if (owned != null && owned == 1) {
                return requestedSessionId;
            }
        }
        return UUID.randomUUID().toString();
    }

    @Transactional
    public SavedExchange saveExchange(
            AssistantIdentity identity,
            String sessionId,
            String requestId,
            String question,
            String answer,
            List<Citation> citations,
            boolean degraded
    ) {
        String assistantMessageId = UUID.randomUUID().toString();
        String userMessageId = UUID.randomUUID().toString();
        String title = question.length() <= 80 ? question : question.substring(0, 80);
        LocalDateTime now = LocalDateTime.now();
        String citationsJson = writeCitations(citations);

        try {
            jdbcTemplate.update("""
                    INSERT INTO assistant_session
                        (id, channel, subject, employee_no, display_name, title, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    sessionId,
                    identity.channel(),
                    identity.subject(),
                    emptyToNull(identity.employeeNo()),
                    emptyToNull(identity.displayName()),
                    title,
                    now,
                    now
            );
        } catch (DuplicateKeyException ignored) {
            int updated = jdbcTemplate.update("""
                    UPDATE assistant_session
                    SET employee_no = ?, display_name = ?, updated_at = ?
                    WHERE id = ? AND channel = ? AND subject = ?
                    """,
                    emptyToNull(identity.employeeNo()),
                    emptyToNull(identity.displayName()),
                    now,
                    sessionId,
                    identity.channel(),
                    identity.subject()
            );
            if (updated != 1) {
                throw new BusinessException(409, "会话标识已被其他账号占用");
            }
        }
        jdbcTemplate.update("""
                INSERT INTO assistant_message
                    (id, session_id, request_id, role, content, citations_json,
                     degraded, created_at)
                VALUES (?, ?, ?, 'USER', ?, NULL, 0, ?)
                """, userMessageId, sessionId, requestId, question, now);
        jdbcTemplate.update("""
                INSERT INTO assistant_message
                    (id, session_id, request_id, role, content, citations_json,
                     degraded, created_at)
                VALUES (?, ?, ?, 'ASSISTANT', ?, ?, ?, ?)
                """, assistantMessageId, sessionId, requestId, answer, citationsJson, degraded, now);
        return new SavedExchange(assistantMessageId, now);
    }

    public List<ChatResponse> findHistory(AssistantIdentity identity, int limit) {
        return jdbcTemplate.query("""
                SELECT am.request_id,
                       am.id AS message_id,
                       am.session_id,
                       um.content AS question,
                       am.content AS answer,
                       am.citations_json,
                       am.degraded,
                       am.feedback,
                       am.created_at
                FROM assistant_message am
                JOIN assistant_session s ON s.id = am.session_id
                LEFT JOIN assistant_message um
                  ON um.session_id = am.session_id
                 AND um.request_id = am.request_id
                 AND um.role = 'USER'
                WHERE s.channel = ?
                  AND s.subject = ?
                  AND am.role = 'ASSISTANT'
                ORDER BY am.created_at DESC
                LIMIT ?
                """, (rs, rowNum) -> mapHistory(rs), identity.channel(), identity.subject(), limit);
    }

    public Optional<ChatResponse> findExchange(AssistantIdentity identity, String requestId) {
        if (requestId == null || requestId.isBlank()) return Optional.empty();
        List<ChatResponse> matches = jdbcTemplate.query("""
                SELECT am.request_id,
                       am.id AS message_id,
                       am.session_id,
                       um.content AS question,
                       am.content AS answer,
                       am.citations_json,
                       am.degraded,
                       am.feedback,
                       am.created_at
                FROM assistant_message am
                JOIN assistant_session s ON s.id = am.session_id
                LEFT JOIN assistant_message um
                  ON um.session_id = am.session_id
                 AND um.request_id = am.request_id
                 AND um.role = 'USER'
                WHERE s.channel = ? AND s.subject = ?
                  AND am.request_id = ? AND am.role = 'ASSISTANT'
                LIMIT 1
                """, (rs, rowNum) -> mapHistory(rs),
                identity.channel(), identity.subject(), requestId);
        return matches.stream().findFirst();
    }

    @Transactional
    public void saveFeedback(
            AssistantIdentity identity,
            String messageId,
            String rating,
            String comment
    ) {
        int updated = jdbcTemplate.update("""
                UPDATE assistant_message
                SET feedback = ?,
                    feedback_comment = ?,
                    feedback_at = CURRENT_TIMESTAMP
                WHERE id = ?
                  AND role = 'ASSISTANT'
                  AND EXISTS (
                      SELECT 1
                      FROM assistant_session s
                      WHERE s.id = assistant_message.session_id
                        AND s.channel = ?
                        AND s.subject = ?
                  )
                """, rating, emptyToNull(comment), messageId, identity.channel(), identity.subject());
        if (updated != 1) {
            throw new BusinessException(404, "消息不存在或不属于当前账号");
        }
    }

    public Optional<DocumentState> findDocumentByPath(String sourcePath) {
        List<DocumentState> documents = jdbcTemplate.query("""
                SELECT id, title, source_path, checksum, version, visibility, status, chunk_count
                FROM assistant_document
                WHERE source_path = ?
                """, (rs, rowNum) -> mapDocument(rs), sourcePath);
        return documents.stream().findFirst();
    }

    public List<DocumentState> listDocuments() {
        return jdbcTemplate.query("""
                SELECT id, title, source_path, checksum, version, visibility, status, chunk_count
                FROM assistant_document
                ORDER BY source_path
                """, (rs, rowNum) -> mapDocument(rs));
    }

    @Transactional
    public void markDocumentIndexing(DocumentState document) {
        int updated = jdbcTemplate.update("""
                UPDATE assistant_document
                SET id = ?, title = ?, checksum = ?, version = ?, visibility = ?,
                    status = 'INDEXING', chunk_count = 0, updated_at = CURRENT_TIMESTAMP
                WHERE source_path = ?
                """,
                document.id(),
                document.title(),
                document.checksum(),
                document.version(),
                document.visibility(),
                document.sourcePath()
        );
        if (updated == 1) {
            return;
        }
        try {
            jdbcTemplate.update("""
                    INSERT INTO assistant_document
                        (id, title, source_path, checksum, version, visibility,
                         status, chunk_count, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, 'INDEXING', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    """,
                    document.id(),
                    document.title(),
                    document.sourcePath(),
                    document.checksum(),
                    document.version(),
                    document.visibility()
            );
        } catch (DuplicateKeyException ignored) {
            jdbcTemplate.update("""
                    UPDATE assistant_document
                    SET id = ?, title = ?, checksum = ?, version = ?, visibility = ?,
                        status = 'INDEXING', chunk_count = 0, updated_at = CURRENT_TIMESTAMP
                    WHERE source_path = ?
                    """,
                    document.id(),
                    document.title(),
                    document.checksum(),
                    document.version(),
                    document.visibility(),
                    document.sourcePath()
            );
        }
    }

    public void markDocumentReady(String documentId, int chunkCount) {
        jdbcTemplate.update("""
                UPDATE assistant_document
                SET status = 'READY', chunk_count = ?, indexed_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """, chunkCount, documentId);
    }

    public void markDocumentFailed(String documentId) {
        jdbcTemplate.update("""
                UPDATE assistant_document
                SET status = 'FAILED', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """, documentId);
    }

    public void deleteDocument(String documentId) {
        jdbcTemplate.update("DELETE FROM assistant_document WHERE id = ?", documentId);
    }

    public int countReadyDocuments() {
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM assistant_document WHERE status = 'READY'",
                    Integer.class
            );
            return count == null ? 0 : count;
        } catch (DataAccessException ignored) {
            return 0;
        }
    }

    private ChatResponse mapHistory(ResultSet rs) throws SQLException {
        return new ChatResponse(
                rs.getString("request_id"),
                rs.getString("message_id"),
                rs.getString("session_id"),
                rs.getString("question"),
                rs.getString("answer"),
                readCitations(rs.getString("citations_json")),
                null,
                rs.getBoolean("degraded"),
                rs.getTimestamp("created_at").toLocalDateTime(),
                rs.getString("feedback")
        );
    }

    private DocumentState mapDocument(ResultSet rs) throws SQLException {
        return new DocumentState(
                rs.getString("id"),
                rs.getString("title"),
                rs.getString("source_path"),
                rs.getString("checksum"),
                rs.getString("version"),
                rs.getString("visibility"),
                rs.getString("status"),
                rs.getInt("chunk_count")
        );
    }

    private String writeCitations(List<Citation> citations) {
        try {
            return objectMapper.writeValueAsString(citations == null ? List.of() : citations);
        } catch (Exception error) {
            throw new BusinessException(500, "引用信息保存失败");
        }
    }

    private List<Citation> readCitations(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, CITATION_LIST);
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private String emptyToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    public record SavedExchange(String messageId, LocalDateTime createdAt) {
    }

    public record DocumentState(
            String id,
            String title,
            String sourcePath,
            String checksum,
            String version,
            String visibility,
            String status,
            int chunkCount
    ) {
    }
}
