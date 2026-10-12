export type Role = 'intern' | 'mentor' | 'admin';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  school: string;
  role: Role;
  cohort: string;
  level_id: number | null;
}

export interface Level {
  id: number;
  rank: number;
  name: string;
  description: string;
  min_score: number;
  min_modules: number;
  min_drills_passed: number;
}

export interface Settings {
  weight_quiz: number;
  weight_drill: number;
  weight_completion: number;
  quiz_pass_mark: number;
  drill_pass_mark: number;
  quiz_max_attempts: number;
}

export interface Stats {
  score: number;
  quiz_avg: number;
  drill_avg: number;
  completion_pct: number;
  modules_completed: number;
  drills_passed: number;
  published_modules: number;
}

export interface ModuleStatus {
  module_id: string;
  week: number;
  position: number;
  title: string;
  objective: string;
  has_quiz: boolean;
  has_drill: boolean;
  question_count: number;
  quiz_best: number | null;
  attempts_used: number;
  attempts_left: number;
  drill_status: 'submitted' | 'reviewed' | null;
  drill_score: number | null;
  completed: boolean;
}

export interface Promotion {
  current: Level | null;
  next: Level | null;
  ready: boolean;
  checks: { label: string; have: number; need: number }[];
}

export interface Dashboard {
  profile: { full_name: string; role: Role; cohort: string; school: string };
  stats: Stats;
  rank: number | null;
  cohort_size: number;
  promotion: Promotion;
  next_module: ModuleStatus | null;
  activity: { at: string; kind: 'quiz' | 'drill'; title: string; value: number | null; status: string | null }[];
  settings: Settings;
}

export interface Module {
  id: string;
  week: number;
  position: number;
  title: string;
  objective: string;
  body: string;
  video_url: string;
  resource_url: string;
  drill_prompt: string;
  published: boolean;
}

export interface Question {
  id: string;
  prompt: string;
  options: string[];
  explanation: string;
  position: number;
}
