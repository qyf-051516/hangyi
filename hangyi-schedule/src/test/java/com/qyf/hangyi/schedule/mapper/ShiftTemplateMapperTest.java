package com.qyf.hangyi.schedule.mapper;

import com.qyf.hangyi.schedule.entity.ShiftTemplate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class ShiftTemplateMapperTest {

    @Autowired
    private ShiftTemplateMapper shiftTemplateMapper;

    @Test
    void testSelectById() {
        ShiftTemplate shift = shiftTemplateMapper.selectById(1L);
        assertThat(shift).isNotNull();
        assertThat(shift.getShiftCode()).isEqualTo("MORNING");
        assertThat(shift.getShiftName()).isEqualTo("早班");
    }

    @Test
    void testSelectList() {
        List<ShiftTemplate> list = shiftTemplateMapper.selectList(null);
        assertThat(list).hasSize(3);
    }
}
