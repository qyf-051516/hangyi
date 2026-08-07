package com.qyf.hangyi.schedule.solver.solver;

import com.qyf.hangyi.schedule.solver.constraint.ScheduleConstraintProvider;
import com.qyf.hangyi.schedule.solver.domain.SchedulePlan;
import com.qyf.hangyi.schedule.solver.domain.ShiftAssignment;
import org.optaplanner.core.api.solver.SolverManager;
import org.optaplanner.core.config.solver.SolverConfig;
import org.optaplanner.core.config.solver.termination.TerminationConfig;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

@Configuration
public class OptaPlannerConfig {

    private SolverConfig buildSolverConfig(SolverProperties props) {
        return new SolverConfig()
                .withSolutionClass(SchedulePlan.class)
                .withEntityClasses(ShiftAssignment.class)
                .withConstraintProviderClass(ScheduleConstraintProvider.class)
                .withMoveThreadCount(props.getMoveThreadCount());
    }

    private void applyTimeout(SolverConfig config, long timeoutMs) {
        TerminationConfig term = new TerminationConfig();
        term.setSpentLimit(Duration.ofMillis(timeoutMs));
        config.setTerminationConfig(term);
    }

    @Bean
    public SolverConfig scheduleSolverConfig(SolverProperties props) {
        SolverConfig config = buildSolverConfig(props);
        applyTimeout(config, props.getCommitTimeoutMs());
        return config;
    }

    @Bean(name = "previewSolverConfig")
    public SolverConfig previewSolverConfig(SolverProperties props) {
        SolverConfig config = buildSolverConfig(props);
        applyTimeout(config, props.getPreviewTimeoutMs());
        return config;
    }

    @Bean(name = "commitSolverConfig")
    public SolverConfig commitSolverConfig(SolverProperties props) {
        SolverConfig config = buildSolverConfig(props);
        applyTimeout(config, props.getCommitTimeoutMs());
        return config;
    }

    @Bean
    public SolverManager<SchedulePlan, String> scheduleSolverManager(
            @org.springframework.beans.factory.annotation.Qualifier("scheduleSolverConfig") SolverConfig config) {
        return SolverManager.create(config);
    }

    @Bean(name = "previewSolverManager", destroyMethod = "close")
    public SolverManager<SchedulePlan, String> previewSolverManager(
            @Qualifier("previewSolverConfig") SolverConfig config) {
        return SolverManager.create(config);
    }

    @Bean(name = "commitSolverManager", destroyMethod = "close")
    public SolverManager<SchedulePlan, String> commitSolverManager(
            @Qualifier("commitSolverConfig") SolverConfig config) {
        return SolverManager.create(config);
    }
}
