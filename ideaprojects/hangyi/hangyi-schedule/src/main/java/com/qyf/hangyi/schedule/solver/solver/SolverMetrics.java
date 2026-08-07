package com.qyf.hangyi.schedule.solver.solver;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Component
public class SolverMetrics {

    private final Counter solveTotal;
    private final Counter infeasibleTotal;
    private final Timer solveDuration;

    public SolverMetrics(MeterRegistry registry) {
        this.solveTotal = Counter.builder("solver_solve_total")
                .register(registry);
        this.infeasibleTotal = Counter.builder("solver_infeasible_total")
                .register(registry);
        this.solveDuration = Timer.builder("solver_solve_duration")
                .publishPercentileHistogram()
                .minimumExpectedValue(Duration.ofMillis(50))
                .maximumExpectedValue(Duration.ofSeconds(10))
                .register(registry);
    }

    /**
     * 记录一次求解结果。
     *
     * <p>三个指标同时上报：
     * <ul>
     *   <li>{@code solver_solve_total} —— 求解次数累加（{@link Counter}）</li>
     *   <li>{@code solver_infeasible_total} —— 不可行求解次数累加（{@link Counter}），
     *       仅在 {@code feasible = false} 时加 1</li>
     *   <li>{@code solver_solve_duration} —— 求解耗时分布（{@link Timer}，
     *       含 p50/p95/p99 直方图）</li>
     * </ul>
     *
     * <p><b>调用方契约</b>：无论求解成功、超时还是异常（OptaPlanner / Executor），
     * 都必须调一次本方法（{@code try/finally}），否则故障率/超时率不可观测，
     * Prometheus SLO 误报一切正常。详见 CLAUDE.md §4.0 求解指标相关 pitfall。
     *
     * @param feasible  {@code true} = 硬约束 0 违例；{@code false} = 至少 1 个硬约束违例
     * @param elapsedMs 求解耗时（毫秒），从 {@code solve()} 开始计时
     */
    public void recordSolve(boolean feasible, long elapsedMs) {
        solveTotal.increment();
        if (!feasible) infeasibleTotal.increment();
        solveDuration.record(Duration.ofMillis(elapsedMs));
    }
}
