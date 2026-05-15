package com.qyf.hangyi.employee.controller;

import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.employee.entity.AircraftType;
import com.qyf.hangyi.employee.service.AircraftTypeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/aircraft-types")
public class AircraftTypeController {

    @Autowired
    private AircraftTypeService aircraftTypeService;

    @GetMapping("/list")
    public R<List<AircraftType>> list() {
        return R.ok(aircraftTypeService.listActive());
    }

    @GetMapping("/list-all")
    public R<List<AircraftType>> listAll() {
        return R.ok(aircraftTypeService.list());
    }

    @PostMapping
    public R<Void> create(@RequestBody AircraftType type) {
        aircraftTypeService.save(type);
        return R.ok();
    }

    @PutMapping
    public R<Void> update(@RequestBody AircraftType type) {
        aircraftTypeService.updateById(type);
        return R.ok();
    }

    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        aircraftTypeService.removeById(id);
        return R.ok();
    }
}
