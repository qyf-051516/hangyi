package com.qyf.hangyi.audit.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.audit.entity.OperationLog;
import com.qyf.hangyi.audit.mapper.OperationLogMapper;
import com.qyf.hangyi.audit.service.OperationLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.StringJoiner;

@Service
public class OperationLogServiceImpl implements OperationLogService {

    @Autowired
    private OperationLogMapper mapper;

    @Override
    public void log(String action, String detail, String targetType, String targetId, Long operatorId) {
        OperationLog log = new OperationLog();
        log.setAction(action);
        log.setDetail(detail);
        log.setTargetType(targetType);
        log.setTargetId(targetId);
        log.setOperatorId(operatorId);
        mapper.insert(log);
    }

    @Override
    public Page<OperationLog> query(int page, int size, String action, String startDate, String endDate) {
        LambdaQueryWrapper<OperationLog> qw = new LambdaQueryWrapper<>();
        qw.eq(action != null && !action.isEmpty(), OperationLog::getAction, action);
        if (startDate != null && !startDate.isEmpty()) {
            qw.ge(OperationLog::getCreatedAt, LocalDate.parse(startDate).atStartOfDay());
        }
        if (endDate != null && !endDate.isEmpty()) {
            qw.le(OperationLog::getCreatedAt, LocalDate.parse(endDate).atTime(23, 59, 59));
        }
        qw.orderByDesc(OperationLog::getCreatedAt);
        return mapper.selectPage(new Page<>(page, size), qw);
    }

    @Override
    public String exportCsv(String action, String startDate, String endDate) {
        LambdaQueryWrapper<OperationLog> qw = new LambdaQueryWrapper<>();
        qw.eq(action != null && !action.isEmpty(), OperationLog::getAction, action);
        if (startDate != null && !startDate.isEmpty()) {
            qw.ge(OperationLog::getCreatedAt, LocalDate.parse(startDate).atStartOfDay());
        }
        if (endDate != null && !endDate.isEmpty()) {
            qw.le(OperationLog::getCreatedAt, LocalDate.parse(endDate).atTime(23, 59, 59));
        }
        qw.orderByDesc(OperationLog::getCreatedAt);
        List<OperationLog> logs = mapper.selectList(qw);
        StringJoiner sj = new StringJoiner("\n");
        sj.add("时间,操作类型,描述,目标类型,目标ID");
        for (OperationLog l : logs) {
            sj.add(String.format("%s,%s,%s,%s,%s",
                l.getCreatedAt(), l.getAction(), l.getDetail(),
                l.getTargetType(), l.getTargetId()));
        }
        return sj.toString();
    }
}
