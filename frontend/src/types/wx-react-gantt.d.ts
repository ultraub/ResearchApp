/**
 * Type declarations for wx-react-gantt library.
 */

declare module 'wx-react-gantt' {
  import { ComponentType, RefObject } from 'react';

  export interface GanttTask {
    id: string | number;
    text: string;
    start: Date;
    end?: Date;
    duration?: number;
    progress?: number;
    type?: 'task' | 'summary' | 'milestone';
    parent?: string | number;
    open?: boolean;
    lazy?: boolean;
    [key: string]: unknown;
  }

  export interface GanttLink {
    id: string | number;
    source: string | number;
    target: string | number;
    type?: 'e2e' | 'e2s' | 's2e' | 's2s';
  }

  export interface GanttScale {
    unit: 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
    step: number;
    format?: string;
  }

  export interface GanttColumn {
    id: string;
    header: string;
    width?: number;
    align?: 'left' | 'center' | 'right';
    template?: (task: GanttTask) => string;
  }

  export interface GanttApi {
    getTask: (id: string | number) => GanttTask | undefined;
    getState: () => { tasks: GanttTask[] };
    exec: (action: string, payload: Record<string, unknown>) => void;
    on: (event: string, callback: (ev: unknown) => void) => void;
  }

  export interface GanttProps {
    tasks: GanttTask[];
    links?: GanttLink[];
    scales?: GanttScale[];
    columns?: GanttColumn[];
    start?: Date;
    end?: Date;
    cellWidth?: number;
    cellHeight?: number;
    lengthUnit?: 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
    readonly?: boolean;
    activeTask?: string | number;
    apiRef?: RefObject<GanttApi>;
    init?: (api: GanttApi) => void;
  }

  export const Gantt: ComponentType<GanttProps>;
}
