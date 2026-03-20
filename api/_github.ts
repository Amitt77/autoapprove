import { Octokit } from '@octokit/rest';

export const parsePRUrl = (url: string) => {
  const regex = /https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;
  const match = url.match(regex);
  if (!match) return null;
  return { owner: match[1], repo: match[2], pull_number: parseInt(match[3], 10) };
};

export const getPRDetails = async (token: string, owner: string, repo: string, pull_number: number) => {
  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number });
  return data;
};

export const approvePR = async (token: string, owner: string, repo: string, pull_number: number) => {
  const octokit = new Octokit({ auth: token });
  await octokit.rest.pulls.createReview({
    owner, repo, pull_number,
    event: 'APPROVE',
    body: 'Emergency approval via PR Emergency Approval Tool',
  });
};
