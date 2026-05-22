package com.qyf.hangyi.employee.service;

import com.qyf.hangyi.employee.entity.EmployeePreference;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class EmployeePreferenceServiceTest {

    @Autowired
    private EmployeePreferenceService employeePreferenceService;

    @Test
    void testListByEmployee() {
        List<EmployeePreference> result = employeePreferenceService.listByEmployee(1L);
        assertThat(result).isNotNull();
    }
}
