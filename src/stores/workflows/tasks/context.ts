import { TasksApi } from '../../../api/tasks';
import type { SavedAccount } from '../../../core/accounts';
import {
  type SignCount,
  type TaskConfig,
  type TaskStep,
  type TaskSummary,
} from '../../../core/tasks-model';
import { Options } from './shared';

export interface Context {
  host: HTMLElement;
  options: Options;
  api: TasksApi;
  aborter: AbortController;
  accounts: SavedAccount[];
  account: SavedAccount | undefined;
  config: TaskConfig;
  alive: boolean;
  busy: boolean;
  writing: boolean;
  loading: boolean;
  nativeTasks: boolean;
  error: string;
  note: string;
  mode: string;
  generation: number;
  summary: TaskSummary | null;
  sign: SignCount | null;
  steps: TaskStep[];
  pending: { kind: 'save' | 'run'; config: TaskConfig } | null;
  timer: NodeJS.Timeout | null;
  disabled: () => '' | 'disabled';
  fail: (failure: unknown) => void;
  render: () => void;
  prompt: () => void;
  load: () => Promise<void>;
  receiveStatus: (value: unknown) => boolean | undefined;
  status: (poll?: boolean) => Promise<void>;
  save: (value: TaskConfig) => Promise<void>;
  run: (value: TaskConfig) => Promise<void>;
  captureForm: () => void;
  submitted: (event: Event) => void;
  clicked: (event: Event) => void;
  changed: (event: Event) => void;
}
