package com.qyf.hangyi.core.auth.sync;

import com.qyf.hangyi.core.auth.service.SyncService;
import com.qyf.hangyi.common.sync.GuochuangSyncClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * 定时轮询同步服务。
 * 每 60 秒从国创赛拉取变更并写入本地，同时将本地积压变更推送到国创赛。
 */
@Service
public class SyncPollingService {

    private static final Logger log = LoggerFactory.getLogger(SyncPollingService.class);
    private static final List<String> COLLECTIONS = List.of("staff", "flights", "schedules", "swap_requests");

    @Autowired
    private SyncService syncService;

    @Autowired
    private GuochuangSyncClient client;

    private final Map<String, Date> lastPullTimes = new ConcurrentHashMap<>();

    @Scheduled(fixedDelay = 60_000)
    public void poll() {
        Date now = new Date();

        // ① Pull: 拉取国创赛变更 → 写本地
        for (String collection : COLLECTIONS) {
            Date since = lastPullTimes.getOrDefault(collection, new Date(0));
            try {
                List<Map<String, Object>> changes = client.pullChanges(collection, since);
                if (!changes.isEmpty()) {
                    int count = applyChanges(collection, changes);
                    log.info("Pull {}: {} records from guochuang", collection, count);
                }
                lastPullTimes.put(collection, now);
            } catch (Exception e) {
                log.warn("Pull failed for {}: {}", collection, e.getMessage());
            }
        }

        // ② Push: 消费 GuochuangSyncClient 内存队列中的积压数据
        var queue = client.pushQueue;
        if (!queue.isEmpty()) {
            List<GuochuangSyncClient.PushEntry> batch = new ArrayList<>();
            GuochuangSyncClient.PushEntry entry;
            while ((entry = queue.poll()) != null) {
                batch.add(entry);
            }
            Map<String, List<Map<String, Object>>> grouped = batch.stream()
                .collect(Collectors.groupingBy(
                    e -> e.collection(),
                    Collectors.mapping(e -> e.record(), Collectors.toList())
                ));
            for (var group : grouped.entrySet()) {
                try {
                    client.pushChanges(group.getKey(), group.getValue());
                    log.info("Push {}: {} records to guochuang", group.getKey(), group.getValue().size());
                } catch (Exception e) {
                    log.warn("Push failed for {}: {}", group.getKey(), e.getMessage());
                    for (Map<String, Object> record : group.getValue()) {
                        client.pushQueue.add(new GuochuangSyncClient.PushEntry(group.getKey(), record));
                    }
                }
            }
        }
    }

    private int applyChanges(String collection, List<Map<String, Object>> records) {
        return switch (collection) {
            case "staff" -> syncService.syncStaff(records);
            case "flights" -> syncService.syncFlights(records);
            case "schedules" -> syncService.syncSchedules(records);
            case "swap_requests" -> syncService.syncSwapRequests(records);
            default -> 0;
        };
    }
}
