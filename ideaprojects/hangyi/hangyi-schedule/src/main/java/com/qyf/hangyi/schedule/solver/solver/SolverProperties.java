package com.qyf.hangyi.schedule.solver.solver;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "hangyi.solver")
public class SolverProperties {

    // preview / commit 各自独立超时：OptaPlanner 9.44 的 SolverConfig 终止条件
    // 在构造时一次性设（CLAUDE.md §4.0 第 3 条），所以拆为两个 SolverConfig bean：
    // previewSolverConfig (previewTimeoutMs) + commitSolverConfig (commitTimeoutMs)
    private long previewTimeoutMs = 2000;
    private long commitTimeoutMs = 5000;
    private String moveThreadCount = "AUTO";

    public long getPreviewTimeoutMs() { return previewTimeoutMs; }
    public void setPreviewTimeoutMs(long previewTimeoutMs) { this.previewTimeoutMs = previewTimeoutMs; }
    public long getCommitTimeoutMs() { return commitTimeoutMs; }
    public void setCommitTimeoutMs(long commitTimeoutMs) { this.commitTimeoutMs = commitTimeoutMs; }
    public String getMoveThreadCount() { return moveThreadCount; }
    public void setMoveThreadCount(String value) {
        if (value != null && !value.matches("AUTO|\\d+")) {
            throw new IllegalArgumentException("moveThreadCount must be AUTO or positive integer, got: " + value);
        }
        this.moveThreadCount = value;
    }
}
