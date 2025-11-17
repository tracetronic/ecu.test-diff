import { ModifiedFile } from '../src/types.ts';
import expect from 'expect.js';
import sinon, { SinonStub } from 'sinon';
import { createScmAdaptersForTests } from './utils.ts';
const { gh, gl, bb } = createScmAdaptersForTests();
describe('Mapping & Filtering (response files to internal files)', () => {
  describe('handleCommit()', () => {
    context('GitHub Adapter', () => {
      const fakeCommitInfo = {
        owner: 'foo',
        repo: 'bar',
        commitHash: 'abc123',
      };
      const fakeApiResponse = {
        sha: 'sha',
        parents: [{ sha: 'parentSha' }],
        files: [
          {
            filename: 'nested/keep.pkg',
            previous_filename: 'nested-old/oldKeep.pkg',
            additions: 2,
            deletions: 1,
            status: 'renamed',
            sha: 'sha',
            blob_url: '',
            raw_url: '',
            content_url: '',
          },
          {
            filename: 'skip.txt',
            previous_filename: 'skip.txt',
            additions: 1,
            deletions: 0,
            status: 'modified',
            sha: 'sha',
            blob_url: '',
            raw_url: '',
            content_url: '',
          },
        ],
      };

      beforeEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sinon.stub(gh, 'getCommitDetails').resolves(fakeApiResponse as any);
      });
      afterEach(() => sinon.restore());

      it('filters and maps commit files correctly', async () => {
        const result = await gh.handleCommit(fakeCommitInfo, 'token');
        expect(result).to.have.length(1);
        const mf: ModifiedFile = result[0];
        expect(mf.filename).to.equal('nested/keep.pkg');
        expect(mf.filenameOld).to.equal('nested-old/oldKeep.pkg');
        expect(mf.additions).to.equal(2);
        expect(mf.deletions).to.equal(1);
        expect(mf.renamed).to.equal(true);
        expect(mf.shaOld).to.equal('parentSha');
        expect(mf.shaNew).to.equal('sha');
        expect(mf.download.new).to.match(
          /contents\/nested\/keep\.pkg\?ref=sha$/,
        );
        expect(mf.download.old).to.match(
          /contents\/nested-old\/oldKeep\.pkg\?ref=parentSha$/,
        );
      });

      it('throws if commitData.files is missing or not an array', async () => {
        (gh.getCommitDetails as SinonStub).restore();
        const stub = sinon
          .stub(gh, 'getCommitDetails')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .resolves({ sha: 'sha', parents: [{ sha: 'parentSha' }] } as any);
        try {
          await gh.handleCommit(fakeCommitInfo, 'token');
          throw new Error('Promise did not reject');
        } catch (err: any) {
          expect(err.message).to.match(/Unable to retrieve modified files/);
        } finally {
          stub.restore();
        }
      });
    });

    context('GitLab Adapter', () => {
      const fakeCommitInfo = {
        owner: 'foo',
        repo: 'bar',
        commitHash: 'abc123',
      };
      const fakeApiResponse = {
        sha: 'sha',
        parents: [{ sha: 'parentSha' }],
        files: [
          {
            filename: 'nested/keep.pkg',
            filenameOld: 'nested-old/oldKeep.pkg',
            new: false,
            renamed: true,
            deleted: false,
            additions: 2,
            deletions: 1,
          },
        ],
      };

      beforeEach(() => {
        sinon.stub(gl, 'getCommitDetails').resolves(fakeApiResponse);
      });
      afterEach(() => sinon.restore());

      it('processes stats correctly', async () => {
        const result = await gl.handleCommit(fakeCommitInfo, 'token');
        expect(result).to.have.length(1);
        const mf: ModifiedFile = result[0];
        expect(mf.filename).to.equal('nested/keep.pkg');
        expect(mf.filenameOld).to.equal('nested-old/oldKeep.pkg');
        expect(mf.additions).to.equal(2);
        expect(mf.deletions).to.equal(1);
        expect(mf.new).to.equal(false);
        expect(mf.deleted).to.equal(false);
        expect(mf.renamed).to.equal(true);
        expect(mf.shaOld).to.equal('parentSha');
        expect(mf.shaNew).to.equal('sha');
        expect(mf.download.new).to.match(
          /repository\/files\/nested%2fkeep\.pkg\/raw\?ref=sha$/,
        );
        expect(mf.download.old).to.match(
          /repository\/files\/nested-old%2foldKeep\.pkg\/raw\?ref=parentSha$/,
        );
      });

      it('throws if commitData.files is missing or not an array', async () => {
        (gl.getCommitDetails as SinonStub).restore();
        const stub = sinon
          .stub(gl, 'getCommitDetails')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .resolves({ sha: 'sha', parents: [{ sha: 'parentSha' }] } as any);
        try {
          await gl.handleCommit(fakeCommitInfo, 'token');
          throw new Error('Promise did not reject');
        } catch (err: any) {
          expect(err.message).to.match(/Unable to retrieve modified files/);
        } finally {
          stub.restore();
        }
      });
    });

    context('Bitbucket Adapter', () => {
      const fakeCommitInfo = {
        owner: 'foo',
        repo: 'bar',
        commitHash: 'abc123',
      };
      const fakeApiResponse = {
        sha: 'sha',
        parents: [{ sha: 'parentSha' }],
        files: [
          {
            filename: 'keep.pkg',
            filenameOld: 'oldKeep.pkg',
            new: false,
            renamed: true,
            deleted: false,
            additions: 2,
            deletions: 1,
          },
        ],
      };

      beforeEach(() => {
        sinon.stub(bb, 'getCommitDetails').resolves(fakeApiResponse);
      });
      afterEach(() => sinon.restore());

      it('filters and maps commit files correctly', async () => {
        const result = await bb.handleCommit(fakeCommitInfo, 'token');
        expect(result).to.have.length(1);
        const mf: ModifiedFile = result[0];

        expect(mf.filename).to.equal('keep.pkg');
        expect(mf.filenameOld).to.equal('oldKeep.pkg');
        expect(mf.additions).to.equal(2);
        expect(mf.deletions).to.equal(1);
        expect(mf.new).to.equal(false);
        expect(mf.deleted).to.equal(false);
        expect(mf.renamed).to.equal(true);
        expect(mf.shaOld).to.equal('parentSha');
        expect(mf.shaNew).to.equal('sha');
        expect(mf.download.new).to.match(/src\/sha\/keep\.pkg$/);
        expect(mf.download.old).to.match(/src\/parentSha\/oldKeep\.pkg$/);
      });

      it('throws if commitData.files is missing or not an array', async () => {
        (bb.getCommitDetails as SinonStub).restore();
        const stub = sinon
          .stub(bb, 'getCommitDetails')
          .resolves({ sha: 'sha', parents: [{ sha: 'parentSha' }] } as any);

        try {
          await bb.handleCommit(fakeCommitInfo, 'token');
          throw new Error('Promise did not reject');
        } catch (err: any) {
          expect(err.message).to.match(/Unable to retrieve modified files/);
        } finally {
          stub.restore();
        }
      });
    });
  });

  describe('handlePullRequest()', () => {
    context('GitHub Adapter', () => {
      const fakePullInfo = { owner: 'foo', repo: 'bar', pullNumber: '1' };
      const fakeApiResponse = {
        info: { base: { sha: 'baseSha' }, head: { sha: 'headSha' } },
        files: [
          {
            additions: 2,
            deletions: 1,
            filename: 'keep.pkg',
            previous_filename: 'oldKeep.pkg',
            sha: 'headSha',
            status: 'renamed',
            blob_url: '',
            raw_url: '',
            content_url: '',
          },
          {
            additions: 1,
            deletions: 0,
            filename: 'skip.txt',
            previous_filename: 'skip.txt',
            sha: 'headSha',
            status: 'modified',
            blob_url: '',
            raw_url: '',
            content_url: '',
          },
        ],
      };

      beforeEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sinon.stub(gh, 'getPullDetails').resolves(fakeApiResponse as any);
      });
      afterEach(() => sinon.restore());

      it('filters and maps pull request files correctly', async () => {
        const result: ModifiedFile[] = await gh.handlePullRequest(
          fakePullInfo,
          'token',
        );
        expect(result).to.have.length(1);
        const mf = result[0];
        expect(mf.filename).to.equal('keep.pkg');
        expect(mf.filenameOld).to.equal('oldKeep.pkg');
        expect(mf.additions).to.equal(2);
        expect(mf.deletions).to.equal(1);
        expect(mf.new).to.equal(false);
        expect(mf.deleted).to.equal(false);
        expect(mf.renamed).to.equal(true);
        expect(mf.shaOld).to.equal('baseSha');
        expect(mf.shaNew).to.equal('headSha');
        expect(mf.download.old).to.match(
          /contents\/oldKeep\.pkg\?ref=baseSha$/,
        );
        expect(mf.download.new).to.match(/contents\/keep\.pkg\?ref=headSha$/);
      });
    });

    context('GitLab Adapter', () => {
      const fakePullInfo = { owner: 'foo', repo: 'bar', pullNumber: '1' };
      const fakeApiResponse = {
        info: { base: { sha: 'baseSha' }, head: { sha: 'headSha' } },
        files: [
          {
            filename: 'keep.pkg',
            filenameOld: 'oldKeep.pkg',
            additions: 2,
            deletions: 1,
            new: false,
            renamed: true,
            deleted: false,
          },
        ],
      };

      beforeEach(() => {
        sinon.stub(gl, 'getPullDetails').resolves(fakeApiResponse);
      });
      afterEach(() => sinon.restore());

      it('maps merge request files correctly', async () => {
        const result: ModifiedFile[] = await gl.handlePullRequest(
          fakePullInfo,
          'token',
        );
        expect(result).to.have.length(1);
        const mf = result[0];
        expect(mf.filename).to.equal('keep.pkg');
        expect(mf.filenameOld).to.equal('oldKeep.pkg');
        expect(mf.additions).to.equal(2);
        expect(mf.deletions).to.equal(1);
        expect(mf.new).to.equal(false);
        expect(mf.renamed).to.equal(true);
        expect(mf.deleted).to.equal(false);
        expect(mf.shaOld).to.equal('baseSha');
        expect(mf.shaNew).to.equal('headSha');
        expect(mf.download.old).to.match(/raw\?ref=baseSha$/);
        expect(mf.download.new).to.match(/raw\?ref=headSha$/);
      });
    });

    context('Bitbucket Adapter', () => {
      const fakePullInfo = { owner: 'foo', repo: 'bar', pullNumber: '1' };
      const fakeApiResponse = {
        info: { base: { sha: 'baseSha' }, head: { sha: 'headSha' } },
        files: [
          {
            filename: 'keep.pkg',
            filenameOld: 'oldKeep.pkg',
            additions: 2,
            deletions: 1,
            new: false,
            renamed: true,
            deleted: false,
          },
        ],
      };

      beforeEach(() => {
        sinon.stub(bb, 'getPullDetails').resolves(fakeApiResponse);
      });
      afterEach(() => sinon.restore());

      it('maps pull request files correctly', async () => {
        const result: ModifiedFile[] = await bb.handlePullRequest(
          fakePullInfo,
          'token',
        );
        expect(result).to.have.length(1);
        const mf = result[0];

        expect(mf.filename).to.equal('keep.pkg');
        expect(mf.filenameOld).to.equal('oldKeep.pkg');
        expect(mf.additions).to.equal(2);
        expect(mf.deletions).to.equal(1);
        expect(mf.new).to.equal(false);
        expect(mf.renamed).to.equal(true);
        expect(mf.deleted).to.equal(false);
        expect(mf.shaOld).to.equal('baseSha');
        expect(mf.shaNew).to.equal('headSha');
        expect(mf.download.old).to.match(/src\/baseSha\/oldKeep\.pkg$/);
        expect(mf.download.new).to.match(/src\/headSha\/keep\.pkg$/);
      });
    });
  });
});
