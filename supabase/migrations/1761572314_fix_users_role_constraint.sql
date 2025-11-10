-- Migration: fix_users_role_constraint
-- Created at: 1761572314

-- 删除现有的role检查约束
ALTER TABLE users DROP CONSTRAINT users_role_check;

-- 添加新的role检查约束，包含'unassigned'值
ALTER TABLE users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('A', 'B', 'C', 'admin', 'unassigned'));;