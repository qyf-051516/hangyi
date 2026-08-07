package com.qyf.hangyi.schedule.solver.service;

import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.schedule.dto.SmartScheduleRequest;
import com.qyf.hangyi.schedule.solver.domain.SchedulePlan;
import com.qyf.hangyi.schedule.solver.solver.SolverMetrics;
import org.optaplanner.core.api.solver.SolverJob;
import org.optaplanner.core.api.solver.SolverManager;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.util.UUID;
import java.util.concurrent.ExecutionException;

@Service
public class OptaPlannerScheduleService {

    @Autowired
    @Qualifier("previewSolverManager")
    private SolverManager<SchedulePlan, String> previewSolverManager;

    @Autowired
    @Qualifier("commitSolverManager")
    private SolverManager<SchedulePlan, String> commitSolverManager;

    @Autowired
    private ProblemFactory problemFactory;

    @Autowired
    private SolverMetrics solverMetrics;

    public SchedulePlan solve(SmartScheduleRequest req) {
        long start = System.currentTimeMillis();
        SchedulePlan plan = problemFactory.buildForDate(req);
        SolverManager<SchedulePlan, String> mgr = req.isPreview() ? previewSolverManager : commitSolverManager;
        String problemId = UUID.randomUUID().toString();
        SolverJob<SchedulePlan, String> job = mgr.solve(problemId, plan);
        SchedulePlan result;
        try {
            result = job.getFinalBestSolution();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            solverMetrics.recordSolve(false, System.currentTimeMillis() - start);
            throw new BusinessException(500, "求解异常: " + e.getMessage());
        } catch (ExecutionException e) {
            solverMetrics.recordSolve(false, System.currentTimeMillis() - start);
            throw new BusinessException(500, "求解异常: " + e.getMessage());
        }
        if (result == null) {
            solverMetrics.recordSolve(false, System.currentTimeMillis() - start);
            throw new BusinessException(500, "求解未返回结果");
        }
        var score = result.getScore();
        if (score == null) {
            solverMetrics.recordSolve(false, System.currentTimeMillis() - start);
            throw new BusinessException(500, "solver returned null score");
        }
        boolean feasible = score.hardScore() >= 0;
        solverMetrics.recordSolve(feasible, System.currentTimeMillis() - start);
        if (!feasible && !req.isPreview()) {
            throw new BusinessException(422,
                    "未找到满足全部硬约束的排班方案，请调整人员、资质或航班范围");
        }
        return result;
    }
}
