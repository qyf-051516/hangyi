package com.qyf.hangyi.serviceschedule.service;

import java.util.Map;

public interface ServiceScheduleService {
    Map<String, Object> getServiceScheduleTable(String scheduleDate);
    Map<String, Object> publishServiceSchedule(Map<String, Object> payload);
}
