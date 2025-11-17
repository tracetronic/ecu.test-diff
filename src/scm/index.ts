import { Bitbucket } from './bitbucket.ts';
import { Github } from './github.ts';
import { Gitlab } from './gitlab.ts';

export const scmAdapters = {
  github: Github,
  gitlab: Gitlab,
  bitbucket: Bitbucket,
};
