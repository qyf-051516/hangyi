package com.qyf.hangyi.assistant.knowledge;

import com.qyf.hangyi.common.exception.BusinessException;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

@Component
public class MarkdownKnowledgeLoader {

    private static final Pattern HEADING = Pattern.compile("^(#{1,3})\\s+(.+?)\\s*$");
    private static final int TARGET_CHARS = 700;
    private static final int OVERLAP_CHARS = 100;

    public List<LoadedKnowledgeDocument> load(Path root) {
        if (root == null || !Files.isDirectory(root)) {
            throw new BusinessException(400, "知识目录不存在: " + root);
        }
        try (Stream<Path> files = Files.walk(root)) {
            return files
                    .filter(Files::isRegularFile)
                    .filter(this::isSupported)
                    .sorted(Comparator.comparing(Path::toString))
                    .map(path -> loadOne(root, path))
                    .toList();
        } catch (IOException error) {
            throw new BusinessException(500, "知识目录读取失败");
        }
    }

    LoadedKnowledgeDocument loadOne(Path root, Path path) {
        try {
            String raw = Files.readString(path, StandardCharsets.UTF_8)
                    .replace("\r\n", "\n")
                    .replace('\r', '\n');
            ParsedFrontMatter parsed = parseFrontMatter(raw);
            String sourcePath = root.relativize(path).toString().replace('\\', '/');
            String title = parsed.metadata().getOrDefault("title", defaultTitle(path));
            String version = parsed.metadata().getOrDefault("version", "1.0");
            String visibility = parsed.metadata()
                    .getOrDefault("visibility", "EMPLOYEE")
                    .toUpperCase(Locale.ROOT);
            if (!List.of("EMPLOYEE", "ADMIN").contains(visibility)) {
                throw new BusinessException(400, "知识文档 visibility 只能是 EMPLOYEE 或 ADMIN: " + sourcePath);
            }
            String checksum = sha256(raw);
            String documentId = stableUuid("document|" + sourcePath);
            List<Section> sections = parseSections(parsed.body(), title);
            List<KnowledgeChunk> chunks = chunkSections(
                    documentId,
                    title,
                    sourcePath,
                    version,
                    visibility,
                    checksum,
                    sections
            );
            if (chunks.isEmpty()) {
                throw new BusinessException(400, "知识文档没有可索引正文: " + sourcePath);
            }
            return new LoadedKnowledgeDocument(
                    documentId,
                    title,
                    sourcePath,
                    version,
                    visibility,
                    checksum,
                    chunks
            );
        } catch (IOException error) {
            throw new BusinessException(500, "知识文档读取失败: " + path.getFileName());
        }
    }

    private List<KnowledgeChunk> chunkSections(
            String documentId,
            String title,
            String sourcePath,
            String version,
            String visibility,
            String checksum,
            List<Section> sections
    ) {
        List<KnowledgeChunk> result = new ArrayList<>();
        for (Section section : sections) {
            String content = normalizeBody(section.content());
            if (content.isBlank()) {
                continue;
            }
            int start = 0;
            int index = 0;
            while (start < content.length()) {
                int end = Math.min(content.length(), start + TARGET_CHARS);
                if (end < content.length()) {
                    int boundary = findBoundary(content, start, end);
                    if (boundary > start + TARGET_CHARS / 2) {
                        end = boundary;
                    }
                }
                String part = content.substring(start, end).trim();
                if (!part.isBlank()) {
                    String id = stableUuid(
                            "chunk|" + documentId + "|" + checksum + "|"
                                    + section.heading() + "|" + index
                    );
                    result.add(new KnowledgeChunk(
                            id,
                            documentId,
                            title,
                            section.heading(),
                            sourcePath,
                            version,
                            visibility,
                            checksum,
                            part
                    ));
                    index++;
                }
                if (end >= content.length()) {
                    break;
                }
                start = Math.max(start + 1, end - OVERLAP_CHARS);
            }
        }
        return List.copyOf(result);
    }

    private int findBoundary(String content, int start, int proposedEnd) {
        for (int i = proposedEnd; i > start; i--) {
            char value = content.charAt(i - 1);
            if (value == '\n' || value == '。' || value == '；' || value == '！' || value == '？') {
                return i;
            }
        }
        return proposedEnd;
    }

    private List<Section> parseSections(String body, String defaultHeading) {
        List<Section> sections = new ArrayList<>();
        String currentHeading = defaultHeading;
        StringBuilder currentBody = new StringBuilder();
        for (String line : body.split("\n", -1)) {
            Matcher matcher = HEADING.matcher(line);
            if (matcher.matches()) {
                addSection(sections, currentHeading, currentBody);
                currentHeading = matcher.group(2).trim();
                currentBody = new StringBuilder();
            } else {
                currentBody.append(line).append('\n');
            }
        }
        addSection(sections, currentHeading, currentBody);
        return sections;
    }

    private void addSection(List<Section> sections, String heading, StringBuilder content) {
        String normalized = normalizeBody(content.toString());
        if (!normalized.isBlank()) {
            sections.add(new Section(heading, normalized));
        }
    }

    private ParsedFrontMatter parseFrontMatter(String raw) {
        if (!raw.startsWith("---\n")) {
            return new ParsedFrontMatter(Map.of(), raw);
        }
        int end = raw.indexOf("\n---\n", 4);
        if (end < 0) {
            throw new BusinessException(400, "知识文档 front matter 未闭合");
        }
        Map<String, String> metadata = new LinkedHashMap<>();
        String header = raw.substring(4, end);
        for (String line : header.split("\n")) {
            int separator = line.indexOf(':');
            if (separator <= 0) {
                continue;
            }
            String key = line.substring(0, separator).trim().toLowerCase(Locale.ROOT);
            String value = line.substring(separator + 1).trim();
            if (!key.isBlank() && !value.isBlank()) {
                metadata.put(key, value);
            }
        }
        return new ParsedFrontMatter(Map.copyOf(metadata), raw.substring(end + 5));
    }

    private String normalizeBody(String content) {
        return content
                .replaceAll("(?m)^#{1,6}\\s+", "")
                .replaceAll("[ \\t]+", " ")
                .replaceAll("\\n{3,}", "\n\n")
                .trim();
    }

    private boolean isSupported(Path path) {
        String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
        return name.endsWith(".md") || name.endsWith(".txt");
    }

    private String defaultTitle(Path path) {
        String name = path.getFileName().toString();
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }

    private String stableUuid(String value) {
        return UUID.nameUUIDFromBytes(value.getBytes(StandardCharsets.UTF_8)).toString();
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception error) {
            throw new IllegalStateException("SHA-256 不可用", error);
        }
    }

    private record ParsedFrontMatter(Map<String, String> metadata, String body) {
    }

    private record Section(String heading, String content) {
    }
}
