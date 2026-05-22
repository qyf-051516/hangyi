package com.qyf.hangyi.flight.service;

import com.qyf.hangyi.flight.mapper.FlightPlanMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class FlightSyncServiceTest {

    @Autowired
    private FlightSyncService flightSyncService;

    @Autowired
    private FlightPlanMapper flightPlanMapper;

    @Test
    void testSyncFlights() {
        int count = flightSyncService.syncFlights(LocalDate.now());
        assertThat(count).isPositive();
        // verify data was inserted
        assertThat(flightPlanMapper.selectCount(null)).isEqualTo(count);
    }

    @Test
    void testSyncFlights_ClearsOldData() {
        // first sync
        flightSyncService.syncFlights(LocalDate.now());
        long afterFirstSync = flightPlanMapper.selectCount(null);

        // second sync should replace data
        int count = flightSyncService.syncFlights(LocalDate.now());
        long afterSecondSync = flightPlanMapper.selectCount(null);

        assertThat(count).isPositive();
        assertThat(afterSecondSync).isEqualTo(count);
    }
}
