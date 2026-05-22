package com.qyf.hangyi.schedule.controller;

import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.schedule.entity.ShiftTemplate;
import com.qyf.hangyi.schedule.mapper.ShiftTemplateMapper;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/shifts")
public class ShiftTemplateController {

    @Autowired
    private ShiftTemplateMapper shiftTemplateMapper;

    @GetMapping("/list")
    public R<List<ShiftTemplate>> list() {
        return R.ok(shiftTemplateMapper.selectList(null));
    }

    @PostMapping
    public R<Void> create(@Valid @RequestBody ShiftTemplate shift) {
        shiftTemplateMapper.insert(shift);
        return R.ok();
    }

    @PutMapping
    public R<Void> update(@RequestBody ShiftTemplate shift) {
        shiftTemplateMapper.updateById(shift);
        return R.ok();
    }

    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        shiftTemplateMapper.deleteById(id);
        return R.ok();
    }
}
