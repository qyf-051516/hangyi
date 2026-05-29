package com.qyf.hangyi.audit.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.audit.entity.OperationLog;

public interface OperationLogService {
    void log(String action, String detail, String targetType, String targetId, Long operatorId);
    Page<OperationLog> query(int page, int size, String action, String startDate, String endDate);
    String exportCsv(String action, String startDate, String endDate);
}
