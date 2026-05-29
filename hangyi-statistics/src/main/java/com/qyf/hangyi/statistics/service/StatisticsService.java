package com.qyf.hangyi.statistics.service;

import java.util.Map;

public interface StatisticsService {
    Map<String, Object> getScheduleStatistics(String scheduleDate);
    Map<String, Object> getStatusOverview(Long groupId, String startDate, String endDate);
}
