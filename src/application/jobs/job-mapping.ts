import { Job } from '../../domain';

export const companyNameOf = (job: Job): string =>
  job.company?.name ?? `Công ty #${job.companyId}`;

export const sortedSkillNames = (job: Job): string[] =>
  job.skills
    .map((skill) => skill.name)
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
