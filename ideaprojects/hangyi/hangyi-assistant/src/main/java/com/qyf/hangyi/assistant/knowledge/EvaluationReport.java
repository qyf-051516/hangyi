package com.qyf.hangyi.assistant.knowledge;

import java.util.List;

public record EvaluationReport(
        int total,
        int hits,
        double recallAt5,
        List<String> missedQuestionIds
) {
}
