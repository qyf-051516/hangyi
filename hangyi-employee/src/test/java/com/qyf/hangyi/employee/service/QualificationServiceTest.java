package com.qyf.hangyi.employee.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.employee.entity.EmployeeQualification;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class QualificationServiceTest {

    @Autowired
    private QualificationService qualificationService;

    @Test
    void testPageQuery() {
        Page<EmployeeQualification> result = qualificationService.pageQuery(1, 20, null, null);
        assertThat(result.getRecords()).isNotEmpty();
    }

    @Test
    void testListByEmployee() {
        List<EmployeeQualification> result = qualificationService.listByEmployee(1L);
        assertThat(result).isNotEmpty();
    }

    @Test
    void testListExpiringSoon() {
        List<EmployeeQualification> result = qualificationService.listExpiringSoon(30);
        assertThat(result).isNotNull();
    }

    @Test
    void testListExpired() {
        List<EmployeeQualification> result = qualificationService.listExpired();
        assertThat(result).isNotNull();
    }
}
