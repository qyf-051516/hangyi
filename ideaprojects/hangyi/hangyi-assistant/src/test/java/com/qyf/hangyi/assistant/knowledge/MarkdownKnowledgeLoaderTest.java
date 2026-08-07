package com.qyf.hangyi.assistant.knowledge;

import com.qyf.hangyi.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MarkdownKnowledgeLoaderTest {

    private final MarkdownKnowledgeLoader loader = new MarkdownKnowledgeLoader();

    @TempDir
    Path tempDir;

    @Test
    void parsesMetadataSectionsAndStableIds() throws Exception {
        Path file = tempDir.resolve("rules.md");
        Files.writeString(file, """
                ---
                title: 排班规则
                version: 2026.07
                visibility: ADMIN
                ---
                # 排班规则

                ## 资质

                人员需要具备有效机型资质。

                ## 工时

                单日工时按当前系统配置校验。
                """);

        List<LoadedKnowledgeDocument> first = loader.load(tempDir);
        List<LoadedKnowledgeDocument> second = loader.load(tempDir);

        assertEquals(1, first.size());
        LoadedKnowledgeDocument document = first.get(0);
        assertEquals("排班规则", document.title());
        assertEquals("2026.07", document.version());
        assertEquals("ADMIN", document.visibility());
        assertEquals("rules.md", document.sourcePath());
        assertEquals(2, document.chunks().size());
        assertEquals("资质", document.chunks().get(0).section());
        assertEquals(document.id(), second.get(0).id());
        assertEquals(document.chunks().get(0).id(), second.get(0).chunks().get(0).id());
    }

    @Test
    void chunksLongSectionsWithOverlap() throws Exception {
        String longBody = "排班规则说明。".repeat(180);
        Files.writeString(tempDir.resolve("long.md"), "# 长文档\n\n## 正文\n\n" + longBody);

        LoadedKnowledgeDocument document = loader.load(tempDir).get(0);

        assertTrue(document.chunks().size() >= 2);
        assertTrue(document.chunks().stream().allMatch(chunk -> chunk.content().length() <= 700));
        assertFalse(document.chunks().get(0).content().isBlank());
    }

    @Test
    void rejectsUnknownVisibility() throws Exception {
        Files.writeString(tempDir.resolve("bad.md"), """
                ---
                visibility: SECRET
                ---
                # 不合法
                正文
                """);

        assertThrows(BusinessException.class, () -> loader.load(tempDir));
    }
}
