package com.qyf.hangyi.assistant.repository;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.qyf.hangyi.assistant.dto.Citation;
import com.qyf.hangyi.assistant.service.AssistantIdentity;
import com.qyf.hangyi.common.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AssistantRepositoryTest {

    private JdbcTemplate jdbcTemplate;
    private AssistantRepository repository;
    private AssistantIdentity owner;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:assistant-" + System.nanoTime() + ";MODE=MySQL;DB_CLOSE_DELAY=-1",
                "sa",
                ""
        );
        jdbcTemplate = new JdbcTemplate(dataSource);
        createSchema();
        repository = new AssistantRepository(jdbcTemplate, new ObjectMapper());
        owner = new AssistantIdentity("MINIPROGRAM", "openid-owner", "GH001", "张伟", false);
    }

    @Test
    void quotaIncrementIsAtomicAndStopsAtLimit() {
        assertEquals(1, repository.consumeQuota(owner, 2));
        assertEquals(0, repository.consumeQuota(owner, 2));
        assertThrows(BusinessException.class, () -> repository.consumeQuota(owner, 2));

        repository.refundQuota(owner);
        assertEquals(0, repository.consumeQuota(owner, 2));
    }

    @Test
    void historyAndFeedbackAreIsolatedByOwner() {
        String sessionId = repository.resolveSession(owner, null);
        AssistantRepository.SavedExchange saved = repository.saveExchange(
                owner,
                sessionId,
                "request-1",
                "调班怎么申请",
                "从本人排班发起。[1]",
                List.of(new Citation("1", "调班流程", "提交", "03.md", 0.8)),
                false
        );
        AssistantIdentity other = new AssistantIdentity(
                "MINIPROGRAM", "openid-other", "GH002", "李强", false
        );

        assertEquals(1, repository.findHistory(owner, 20).size());
        assertEquals(0, repository.findHistory(other, 20).size());
        assertNotEquals(sessionId, repository.resolveSession(other, sessionId));
        assertThrows(
                BusinessException.class,
                () -> repository.saveFeedback(other, saved.messageId(), "DOWN", "")
        );

        repository.saveFeedback(owner, saved.messageId(), "UP", "有帮助");
        assertEquals("UP", repository.findHistory(owner, 20).get(0).feedback());
        assertEquals(
                "UP",
                jdbcTemplate.queryForObject(
                        "SELECT feedback FROM assistant_message WHERE id = ?",
                        String.class,
                        saved.messageId()
                )
        );
    }

    private void createSchema() {
        jdbcTemplate.execute("""
                CREATE TABLE assistant_session (
                    id VARCHAR(64) PRIMARY KEY,
                    channel VARCHAR(20) NOT NULL,
                    subject VARCHAR(128) NOT NULL,
                    employee_no VARCHAR(32),
                    display_name VARCHAR(100),
                    title VARCHAR(100),
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE assistant_message (
                    id VARCHAR(64) PRIMARY KEY,
                    session_id VARCHAR(64) NOT NULL,
                    request_id VARCHAR(64) NOT NULL,
                    role VARCHAR(20) NOT NULL,
                    content CLOB NOT NULL,
                    citations_json CLOB,
                    degraded BOOLEAN DEFAULT FALSE,
                    feedback VARCHAR(10),
                    feedback_comment VARCHAR(500),
                    feedback_at TIMESTAMP,
                    created_at TIMESTAMP,
                    UNIQUE (request_id, role),
                    FOREIGN KEY (session_id) REFERENCES assistant_session(id)
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE assistant_daily_quota (
                    channel VARCHAR(20) NOT NULL,
                    subject VARCHAR(128) NOT NULL,
                    quota_date DATE NOT NULL,
                    request_count INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    PRIMARY KEY (channel, subject, quota_date)
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE assistant_document (
                    id VARCHAR(64) PRIMARY KEY,
                    title VARCHAR(200) NOT NULL,
                    source_path VARCHAR(500) NOT NULL UNIQUE,
                    checksum VARCHAR(64) NOT NULL,
                    version VARCHAR(50) NOT NULL,
                    visibility VARCHAR(20) NOT NULL,
                    status VARCHAR(20) NOT NULL,
                    chunk_count INT NOT NULL DEFAULT 0,
                    indexed_at TIMESTAMP,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
                """);
    }
}
