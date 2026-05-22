package com.qyf.hangyi.employee.service;

import com.qyf.hangyi.employee.entity.AircraftType;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class AircraftTypeServiceTest {

    @Autowired
    private AircraftTypeService aircraftTypeService;

    @Test
    void testListActive() {
        List<AircraftType> result = aircraftTypeService.listActive();
        assertThat(result).isNotEmpty();
        assertThat(result).allMatch(t -> t.getStatus() == 1);
    }

    @Test
    void testList() {
        List<AircraftType> result = aircraftTypeService.list();
        assertThat(result).hasSize(2);
    }
}
