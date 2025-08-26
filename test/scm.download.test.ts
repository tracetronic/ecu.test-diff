import { scmAdapters } from '../src/scm.js';
import { ModifiedFile } from '../src/types.ts';
import expect from 'expect.js';
import sinon, { SinonStub } from 'sinon';
import browser from 'webextension-polyfill';

let adapter: any;
let sandbox: sinon.SinonSandbox;
let downloadListeners: Array<(delta: any) => void>;
let downloadsStub: any;
let tabsStub: any;
let createObjectURLStub: SinonStub;
let revokeObjectURLStub: SinonStub;

beforeEach(() => {
  sandbox = sinon.createSandbox();
  downloadListeners = [];

  adapter = new scmAdapters.github({ host: 'github.com', scm: 'github' });

  downloadsStub = {
    download: sandbox.stub().resolves(123),
    search: sandbox.stub().resolves([{ filename: '/tmp/file.ext' }]),
    onChanged: {
      addListener: (cb: any) => downloadListeners.push(cb),
      removeListener: sandbox.stub(),
    },
    erase: sandbox.stub().resolves(undefined),
  };
  tabsStub = {
    update: sandbox.stub().resolves(undefined),
  };

  sandbox.stub(browser, 'downloads').get(() => downloadsStub);
  sandbox.stub(browser, 'tabs').get(() => tabsStub);

  (global as any).fetch = sandbox.stub();

  createObjectURLStub = sandbox
    .stub(URL, 'createObjectURL')
    .returns('blob://fake');
  revokeObjectURLStub = sandbox
    .stub(URL, 'revokeObjectURL')
    .callsFake(() => {});

  (global as any).Buffer = Buffer;
});

afterEach(() => {
  sandbox.restore();
});

describe('Download helpers', () => {
  describe('calcShortHash()', () => {
    it('returns first 8 characters', () => {
      const res = adapter['calcShortHash']('abcdefghijklmnop');
      expect(res).to.equal('abcdefgh');
    });
  });

  describe('downloadDummy()', () => {
    it('calls doDownload with correct data URL and filename', async () => {
      const ddSpy = sandbox
        .stub(adapter as any, 'doDownload')
        .resolves('/tmp/diff/file.ext');
      const out = await adapter['downloadDummy']('path/to/file.ext', '.X');
      expect(
        ddSpy.calledWith(
          'data:text/ext;charset=utf-8,',
          'diff/file/file.X.ext',
        ),
      ).to.equal(true);
      expect(out).to.equal('/tmp/diff/file.ext');
    });

    it('uses correct mime type', async () => {
      const spy = sandbox.stub(adapter as any, 'doDownload');
      await adapter['downloadDummy']('some/path/file.ext', '.X');
      expect(
        spy.calledWith('data:text/ext;charset=utf-8,', 'diff/file/file.X.ext'),
      ).to.be(true);
    });
  });

  describe('doDownload()', () => {
    it('resolves when download completes and removes listener', async () => {
      const promise = adapter['doDownload']('url', 'file.ext');
      await Promise.resolve();

      const downloadStub = downloadsStub.download as SinonStub;
      expect(
        downloadStub.calledWith({
          url: 'url',
          filename: 'file.ext',
          conflictAction: 'overwrite',
        }),
      ).to.equal(true);

      downloadListeners.forEach((cb) =>
        cb({ id: 123, state: { current: 'complete' } }),
      );

      const filename = await promise;
      expect(filename).to.equal('/tmp/file.ext');

      expect(downloadsStub.onChanged.removeListener.called).to.equal(true);
      expect(downloadsStub.erase.calledWith({ id: 123 })).to.equal(true);
    });

    it('throws if downloadId is undefined', async () => {
      downloadsStub.download.resolves(undefined);
      try {
        await adapter['doDownload']('url', 'file.ext');
        expect().fail('Expected error not thrown');
      } catch (err: any) {
        expect(err.message).to.be('Failed to start download');
      }
    });

    it('throws if search returns no items', async () => {
      const promise = adapter['doDownload']('url', 'file.ext');
      await Promise.resolve();
      downloadsStub.search.resolves([]);
      downloadListeners.forEach((cb) =>
        cb({ id: 123, state: { current: 'complete' } }),
      );
      try {
        await promise;
        expect().fail('Expected error not thrown');
      } catch (err: any) {
        expect(err.message).to.be('Failed to retrieve download item');
      }
    });
  });

  describe('doDownloadFile()', () => {
    const apiUrl = 'https://api';
    const filename = 'dir/file.ext';
    const suffix = '.S';
    const token = 'token';
    const sha = 'abc123';
    const base64Content = Buffer.from('content').toString('base64');
    const fakeJson = { content: base64Content };

    beforeEach(() => {
      (global as any).fetch.resolves({
        ok: true,
        statusText: 'OK',
        json: async () => fakeJson,
        blob: async () => new Blob([Uint8Array.from('content')]),
        headers: { get: (_: string) => null },
      });
    });

    it('handles JSON type with ObjectURL support', async () => {
      sandbox.stub(adapter as any, 'doDownload').resolves('/out.ext');

      const out = await adapter['doDownloadFile'](
        apiUrl,
        'json',
        filename,
        suffix,
        token,
        sha,
      );

      expect(
        (global as any).fetch.calledWith(apiUrl, {
          headers: adapter.createHeaders(token),
        }),
      ).to.be(true);
      expect(createObjectURLStub.called).to.be(true);
      expect(revokeObjectURLStub.called).to.be(true);
      expect(out).to.be('/out.ext');
    });

    it('throws a non-ok response', async () => {
      (global as any).fetch.resolves({ ok: false, statusText: '404' });
      try {
        await adapter['doDownloadFile'](
          apiUrl,
          'json',
          filename,
          suffix,
          token,
          sha,
        );
        expect().fail('Expected error not thrown');
      } catch (err: any) {
        expect(err.message).to.match(/Failed to fetch file dir\/file.ext/);
      }
    });

    it('handles RAW type with ObjectURL support', async () => {
      const blobUrl = 'blob:fake-object-url';
      createObjectURLStub.returns(blobUrl);
      const contentBytes = Uint8Array.from(Buffer.from('content'));
      (global as any).fetch.resolves({
        ok: true,
        statusText: 'OK',
        blob: async () => new Blob([contentBytes]),
        headers: { get: (_: string) => null },
      });
      const ddStub = sandbox
        .stub(adapter as any, 'doDownload')
        .resolves('/withObjectURL.ext');
      const out = await adapter['doDownloadFile'](
        apiUrl,
        'raw',
        'dir/file.ext',
        '.S',
        token,
        sha,
      );
      const expectedName = 'diff/file/file.S.ext';
      expect(ddStub.calledWith(blobUrl, expectedName)).to.be(true);
      expect(out).to.be('/withObjectURL.ext');
    });

    it('handles RAW type fallback (no ObjectURL) by building correct data URI', async () => {
      (URL.createObjectURL as SinonStub).restore();
      (URL.createObjectURL as any) = undefined;
      const contentBytes = Uint8Array.from(Buffer.from('content'));
      (global as any).fetch.resolves({
        ok: true,
        statusText: 'OK',
        blob: async () => new Blob([contentBytes]),
        headers: { get: (_: string) => null },
      });
      const ddStub = sandbox
        .stub(adapter as any, 'doDownload')
        .resolves('/fallback.ext');
      const out = await adapter['doDownloadFile'](
        apiUrl,
        'raw',
        'dir/file.ext',
        '.S',
        token,
        sha,
      );
      // "content" -> Base64 "Y29udGVudA==" -> URI‑encoded "Y29udGVudA%3D%3D"
      const expectedDataUrl = 'data:text/ext;base64,Y29udGVudA%3D%3D';
      const expectedName = 'diff/file/file.S.ext';
      expect(ddStub.calledWith(expectedDataUrl, expectedName)).to.be(true);
      expect(out).to.be('/fallback.ext');
    });

    it('throws on unknown type', async () => {
      try {
        await adapter['doDownloadFile'](
          apiUrl,
          'xml',
          filename,
          suffix,
          token,
          sha,
        );
        expect().fail('Expected error not thrown');
      } catch (err: any) {
        expect(err.message).to.be('Unknown download type: xml');
      }
    });

    it('builds data URI when URL.createObjectURL is unavailable', async () => {
      (URL.createObjectURL as SinonStub).restore();
      (URL.createObjectURL as any) = undefined;

      const payload = Buffer.from('hello').toString('base64');
      (global as any).fetch.resolves({
        ok: true,
        statusText: 'OK',
        json: async () => ({ content: payload }),
        headers: { get: (_: string) => null },
      });

      const dd = sandbox
        .stub(adapter as any, 'doDownload')
        .resolves('/jf.json');
      const out = await adapter['doDownloadFile'](
        'u',
        'json',
        'dir/foo.txt',
        '.S',
        'T',
        'sha',
      );

      const expected = `data:text/plain;base64,${payload}`;
      expect(dd.calledWith(expected, 'diff/foo/foo.S.txt')).to.be(true);
      expect(out).to.be('/jf.json');
    });
  });

  describe('downloadDiff()', () => {
    it('combines doDownloadFile and downloadDummy and updates the tab', async () => {
      const file: ModifiedFile = {
        filename: 'file.ext',
        filenameOld: 'file.ext',
        new: false,
        renamed: false,
        deleted: true,
        additions: 0,
        deletions: 0,
        shaOld: 'shaOld',
        shaNew: 'shaNew',
        download: { type: 'raw', old: 'url/old', new: 'url/new' },
      };

      const ddFileStub = sandbox
        .stub(adapter as any, 'doDownloadFile')
        .resolves('/old.ext');
      const dummyStub = sandbox
        .stub(adapter as any, 'downloadDummy')
        .resolves('/new.ext');

      await adapter.downloadDiff(file, 'token');

      expect(
        ddFileStub.calledWith(
          'url/old',
          'raw',
          'file.ext',
          '.shaOld.old',
          'token',
          'shaOld',
        ),
      ).to.be(true);
      expect(dummyStub.calledWith('file.ext', '.shaNew.new')).to.be(true);

      const expectedUrl = encodeURI(
        'tracetronic://diff?file1=/old.ext&file2=/new.ext&cleanup=True',
      );
      expect(tabsStub.update.calledWith({ url: expectedUrl })).to.be(true);
    });

    it('uses downloadDummy for old file when new=true and doDownloadFile for new file when not deleted', async () => {
      const file: ModifiedFile = {
        filename: 'file.ext',
        filenameOld: 'file.ext',
        new: true,
        renamed: false,
        deleted: false,
        additions: 0,
        deletions: 0,
        shaOld: 'shaOld',
        shaNew: 'shaNew',
        download: { type: 'raw', old: 'url/old', new: 'url/new' },
      };

      const dummyStub = sandbox
        .stub(adapter as any, 'downloadDummy')
        .resolves('/old.ext');
      const ddFileStub = sandbox
        .stub(adapter as any, 'doDownloadFile')
        .resolves('/new.ext');

      await adapter.downloadDiff(file, 'token');
      expect(dummyStub.calledWith('file.ext', '.shaOld.old')).to.be(true);

      expect(
        ddFileStub.calledWith(
          'url/new',
          'raw',
          'file.ext',
          '.shaNew.new',
          'token',
          'shaNew',
        ),
      ).to.be(true);
      const expectedUrl = encodeURI(
        'tracetronic://diff?file1=/old.ext&file2=/new.ext&cleanup=True',
      );
      expect(tabsStub.update.calledWith({ url: expectedUrl })).to.be(true);
    });
  });

  describe('downloadFile()', () => {
    it('calls doDownloadFile then updates the tab', async () => {
      const file: ModifiedFile = {
        filename: 'file.ext',
        filenameOld: 'file.ext',
        new: true,
        renamed: false,
        deleted: false,
        additions: 0,
        deletions: 0,
        shaOld: 'shaOld',
        shaNew: 'shaNew',
        download: { type: 'json', old: 'url/old', new: 'url/new' },
      };

      const ddFileStub = sandbox
        .stub(adapter as any, 'doDownloadFile')
        .resolves('/file.ext');
      await adapter.downloadFile(file, 'new', 'token');
      expect(
        ddFileStub.calledWith(
          'url/new',
          'json',
          'file.ext',
          '.shaNew.new',
          'token',
          'shaNew',
        ),
      ).to.be(true);

      await adapter.downloadFile(file, 'old', 'token');
      expect(
        ddFileStub.calledWith(
          'url/old',
          'json',
          'file.ext',
          '.shaOld.old',
          'token',
          'shaOld',
        ),
      ).to.be(true);

      const tabUrl = encodeURI('tracetronic:///' + '/file.ext');
      expect(tabsStub.update.calledWith({ url: tabUrl })).to.be(true);
    });
  });
});
