package com.qyf.hangyi.employee.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.employee.entity.TeamGroup;
import com.qyf.hangyi.employee.mapper.TeamGroupMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/groups")
public class TeamGroupController {

    @Autowired
    private TeamGroupMapper teamGroupMapper;

    @GetMapping("/list")
    public R<List<TeamGroup>> list(@RequestParam(required = false) String groupType) {
        List<TeamGroup> list = teamGroupMapper.selectList(
                new LambdaQueryWrapper<TeamGroup>()
                        .eq(groupType != null, TeamGroup::getGroupType, groupType)
                        .eq(TeamGroup::getStatus, 1)
        );
        return R.ok(list);
    }

    @PostMapping
    public R<Void> create(@RequestBody TeamGroup group) {
        teamGroupMapper.insert(group);
        return R.ok();
    }

    @PutMapping
    public R<Void> update(@RequestBody TeamGroup group) {
        teamGroupMapper.updateById(group);
        return R.ok();
    }

    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        teamGroupMapper.deleteById(id);
        return R.ok();
    }
}
