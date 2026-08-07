package com.qyf.hangyi.assistant.knowledge;

import java.util.List;

public record EvaluationQuestion(
        String id,
        String question,
        List<String> expectedSourcePaths,
        boolean admin
) {
}
