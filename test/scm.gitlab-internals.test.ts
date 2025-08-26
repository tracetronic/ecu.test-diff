import { scmAdapters } from '../src/scm.js';
import expect from 'expect.js';
import sinon from 'sinon';

const gl = new scmAdapters.gitlab({ host: 'gitlab.com', scm: 'gitlab' });

describe('GitLab Adapter internals', () => {
  it('parseStats() counts additions and deletions correctly', () => {
    const stats = (gl as any).parseStats('\n+a\n-b\n+c\n-d\n');
    expect(stats).to.eql({ additions: 2, deletions: 2 });
  });

  it('parseStats() returns zeroes on empty diff', () => {
    const stats = (gl as any).parseStats('');
    expect(stats).to.eql({ additions: 0, deletions: 0 });
  });

  it('processChanges() filters out unsupported filetypes', () => {
    const raw = [
      {
        diff: '+x\n-y',
        new_path: 'keep.pkg',
        old_path: 'keep.pkg',
        new_file: false,
        renamed_file: false,
        deleted_file: false,
        generated_file: null,
      },
      {
        diff: '+x\n-y',
        new_path: 'skip.txt',
        old_path: 'skip.txt',
        new_file: false,
        renamed_file: false,
        deleted_file: false,
        generated_file: null,
      },
    ];
    const out = (gl as any).processChanges(raw);
    expect(out).to.have.length(1);
    expect(out[0].filename).to.equal('keep.pkg');
  });

  it('getCommitDetails throws on initial metadata fetch failure', async () => {
    const fakeInfo = { owner: 'foo', repo: 'bar', commitHash: '123abc' };
    const token = 'tok';
    sinon.stub(gl as any, 'getApiUrl').returns('https://gitlab.com/api/v4');
    sinon
      .stub(gl as any, 'createHeaders')
      .withArgs(token)
      .returns({ Authorization: 'Bearer tok' });

    (globalThis as any).fetch = sinon.stub().resolves({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    try {
      await (gl as any).getCommitDetails(fakeInfo, token);
      expect().fail('Expected error');
    } catch (err: any) {
      expect(err.message).to.match(/\[401\] Unauthorized/);
    } finally {
      sinon.restore();
    }
  });
});
