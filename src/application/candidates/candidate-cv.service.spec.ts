import { Candidate, JobApplication } from '../../domain';
import { InMemoryCandidateFileRepository } from '../../infrastructure/persistence/in-memory-candidate-file-repository';
import { InMemoryCandidateRepository } from '../../infrastructure/persistence/in-memory-candidate-repository';
import { InMemoryJobApplicationRepository } from '../../infrastructure/persistence/in-memory-job-application-repository';
import { InMemoryFileStorage } from '../../infrastructure/storage/in-memory-file-storage';
import {
  FakeJobRepository,
  makeJob,
  MutableClock,
  makeNotifier,
} from '../../testing/test-helpers';
import { ApplicationQueryService } from '../applications/application-query.service';
import { ApplicationService } from '../applications/application.service';
import { ResourceNotFoundException } from '../exceptions';
import { JobMatchService } from '../matching/job-match.service';
import {
  CandidateCvService,
  CV_MAX_BYTES,
  detectCvType,
  toSafeFileName,
} from './candidate-cv.service';

const pdf = (extra = 'noi dung') => Buffer.from(`%PDF-1.7\n${extra}`);
const docx = () =>
  Buffer.concat([
    Buffer.from('504b0304', 'hex'),
    Buffer.from('[Content_Types].xml word/document.xml'),
  ]);

describe('detectCvType', () => {
  it('nhận diện PDF, DOC và DOCX theo nội dung', () => {
    expect(detectCvType(pdf())?.extension).toBe('pdf');
    expect(
      detectCvType(Buffer.from('d0cf11e0a1b11ae10000', 'hex'))?.extension,
    ).toBe('doc');
    expect(detectCvType(docx())?.extension).toBe('docx');
  });

  it('từ chối ZIP không phải DOCX, văn bản thường, tệp thực thi và tệp rỗng', () => {
    const zip = Buffer.concat([
      Buffer.from('504b0304', 'hex'),
      Buffer.from('META-INF/MANIFEST.MF'),
    ]);

    expect(detectCvType(zip)).toBeNull();
    expect(detectCvType(Buffer.from('%PD'))).toBeNull();
    expect(detectCvType(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(detectCvType(Buffer.from('MZ\x90\x00'))).toBeNull();
    expect(detectCvType(Buffer.alloc(0))).toBeNull();
  });
});

describe('toSafeFileName', () => {
  it.each([
    ['CV Nguyễn Văn A.pdf', 'pdf', 'CV Nguyễn Văn A.pdf'],
    ['../../etc/passwd', 'pdf', 'passwd.pdf'],
    ['C:\\Users\\a\\cv.docx', 'pdf', 'cv.pdf'],
    ['bad"name<>:*?|.pdf', 'pdf', 'badname.pdf'],
    ['tab\tnew\nline\u0000.doc', 'doc', 'tabnewline.doc'],
    ['', 'pdf', 'CV.pdf'],
    ['.pdf', 'pdf', 'CV.pdf'],
    ['  nhiều   khoảng   trắng  .pdf', 'pdf', 'nhiều khoảng trắng.pdf'],
  ])('%j → %j', (original, extension, expected) => {
    expect(toSafeFileName(original, extension)).toBe(expected);
  });

  it('giới hạn độ dài và dùng đuôi theo nội dung thật', () => {
    const name = toSafeFileName(`${'a'.repeat(300)}.exe`, 'pdf');

    expect(name).toBe(`${'a'.repeat(80)}.pdf`);
  });
});

describe('CandidateCvService', () => {
  const clock = new MutableClock();

  async function setup() {
    const jobs = new FakeJobRepository().seed(
      makeJob(clock, { id: 1, companyId: 30 }),
      makeJob(clock, { id: 2, companyId: 31 }),
    );
    const applications = new InMemoryJobApplicationRepository();
    const files = new InMemoryCandidateFileRepository(applications);
    const storage = new InMemoryFileStorage();
    const candidates = new InMemoryCandidateRepository();
    await candidates.add(new Candidate(20, 'Nguyễn An', 'an@x.vn'));
    const cv = new CandidateCvService(
      files,
      storage,
      applications,
      jobs,
      clock,
    );
    const apply = new ApplicationService(
      jobs,
      applications,
      clock,
      makeNotifier(),
      files,
    );
    const queries = new ApplicationQueryService(
      jobs,
      applications,
      candidates,
      new JobMatchService(),
      files,
    );

    return { cv, apply, queries, storage, files, applications };
  }

  it('tải lên, xem thông tin và tải về CV hiện tại', async () => {
    const { cv, storage } = await setup();

    const info = await cv.upload(20, {
      originalName: 'CV An.pdf',
      content: pdf('bản 1'),
    });

    expect(info).toMatchObject({
      fileName: 'CV An.pdf',
      contentType: 'application/pdf',
      sizeBytes: pdf('bản 1').length,
    });
    expect(await cv.getInfo(20)).toEqual(info);
    expect((await cv.download(20)).content.equals(pdf('bản 1'))).toBe(true);
    expect(storage.size).toBe(1);
    expect(await cv.getInfo(21)).toBeNull();
  });

  it('từ chối thiếu tệp, tệp rỗng, quá lớn hoặc sai loại', async () => {
    const { cv } = await setup();

    await expect(cv.upload(20, undefined)).rejects.toThrow('chọn tệp');
    await expect(
      cv.upload(20, { originalName: 'a.pdf', content: Buffer.alloc(0) }),
    ).rejects.toThrow('chọn tệp');
    await expect(
      cv.upload(20, {
        originalName: 'a.pdf',
        content: Buffer.concat([pdf(), Buffer.alloc(CV_MAX_BYTES)]),
      }),
    ).rejects.toThrow('5 MB');
    await expect(
      cv.upload(20, {
        originalName: 'cv.pdf',
        content: Buffer.from('giả mạo'),
      }),
    ).rejects.toThrow('PDF, DOC hoặc DOCX');
    expect(await cv.getInfo(20)).toBeNull();
  });

  it('đổi tên đuôi theo nội dung thật khi người dùng đặt sai đuôi', async () => {
    const { cv } = await setup();

    const info = await cv.upload(20, {
      originalName: 'cv.exe',
      content: pdf(),
    });

    expect(info.fileName).toBe('cv.pdf');
  });

  it('tải bản mới thay bản cũ và xóa bản cũ nếu chưa đơn nào dùng', async () => {
    const { cv, storage } = await setup();
    await cv.upload(20, { originalName: 'v1.pdf', content: pdf('1') });

    await cv.upload(20, { originalName: 'v2.pdf', content: pdf('2') });

    expect((await cv.getInfo(20))!.fileName).toBe('v2.pdf');
    expect(storage.size).toBe(1);
  });

  it('đơn ứng tuyển giữ CV tại thời điểm nộp dù ứng viên đổi hoặc xóa CV sau đó', async () => {
    const { cv, apply, queries, storage, applications } = await setup();
    await cv.upload(20, { originalName: 'cũ.pdf', content: pdf('cũ') });
    const application = await apply.apply(20, 1);
    await cv.upload(20, { originalName: 'mới.pdf', content: pdf('mới') });

    expect(application.cvFileId).not.toBeNull();
    // Bản cũ còn được đơn tham chiếu nên chưa bị xóa; bản mới là CV hiện tại.
    expect(storage.size).toBe(2);
    const sent = await cv.downloadForApplication(30, application.id);
    expect(sent.fileName).toBe('cũ.pdf');
    expect(sent.content.equals(pdf('cũ'))).toBe(true);
    expect((await queries.getApplicant(30, application.id)).cv).toMatchObject({
      fileName: 'cũ.pdf',
    });

    await cv.remove(20);
    expect(await cv.getInfo(20)).toBeNull();
    expect(storage.size).toBe(1); // bản mới không còn ai dùng nên bị xóa, bản của đơn vẫn còn
    expect((await cv.downloadForApplication(30, application.id)).fileName).toBe(
      'cũ.pdf',
    );
    expect((await applications.getById(application.id))!.cvFileId).toBe(
      application.cvFileId,
    );
  });

  it('nộp đơn khi chưa có CV thì không đính kèm', async () => {
    const { cv, apply, queries } = await setup();

    const application = await apply.apply(20, 1);

    expect(application.cvFileId).toBeNull();
    expect((await queries.getApplicant(30, application.id)).cv).toBeNull();
    await expect(
      cv.downloadForApplication(30, application.id),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('chỉ công ty sở hữu tin tải được CV của đơn; công ty khác và đơn không tồn tại trả 404', async () => {
    const { cv, apply } = await setup();
    await cv.upload(20, { originalName: 'cv.pdf', content: pdf() });
    const application = await apply.apply(20, 1);

    await expect(
      cv.downloadForApplication(31, application.id),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
    await expect(cv.downloadForApplication(30, 999)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
    await expect(
      cv.downloadForApplication(30, application.id),
    ).resolves.toBeDefined();
  });

  it('xóa CV khi chưa có CV là không lỗi; tải về báo 404', async () => {
    const { cv } = await setup();

    await expect(cv.remove(20)).resolves.toBeUndefined();
    await expect(cv.download(20)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });

  it('tệp tham chiếu bị mất ở kho lưu thì tải về báo 404 thay vì lỗi hệ thống', async () => {
    const { cv, storage, files } = await setup();
    await cv.upload(20, { originalName: 'cv.pdf', content: pdf() });
    await storage.delete((await files.getCurrent(20))!.storageKey);

    await expect(cv.download(20)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });

  it('kiểu JobApplication mang cvFileId', () => {
    expect(new JobApplication(1, 1, 1, new Date()).cvFileId).toBeNull();
  });
});
