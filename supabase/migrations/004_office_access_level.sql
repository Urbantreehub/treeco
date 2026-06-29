-- Add 'office' access level: sees everything except the dashboard
ALTER TYPE access_level ADD VALUE IF NOT EXISTS 'office';
