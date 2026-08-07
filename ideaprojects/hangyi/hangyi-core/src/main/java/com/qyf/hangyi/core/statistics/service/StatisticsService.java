package com.qyf.hangyi.core.statistics.service;

import java.util.Map;

public interface StatisticsService {
    Map<String, Object> getScheduleStatistics(String scheduleDate);
    Map<String, Object> getStatusOverview(Long groupId, String startDate, String endDate);
    java.util.List<Map<String, Object>> getPendingEmployees(Long groupId, String startDate, String endDate);
}
