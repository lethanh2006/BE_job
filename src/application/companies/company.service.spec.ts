import { Company, CompanyStatus } from '../../domain';
import { InMemoryCompanyRepository } from '../../infrastructure/persistence/in-memory-company-repository';
import {
  FakeJobRepository,
  makeJob,
  MutableClock,
} from '../../testing/test-helpers';
import {
  CompanyNameAlreadyExistsException,
  ResourceNotFoundException,
} from '../exceptions';
import { CompanyService } from './company.service';

describe('CompanyService', () => {
  const clock = new MutableClock();

  async function setup() {
    const companies = new InMemoryCompanyRepository();
    await companies.add(
      new Company(30, 'ABC', 'Hà Nội', { website: 'https://abc.vn' }),
    );
    await companies.add(new Company(31, 'Công ty Khác'));
    await companies.add(
      new Company(32, 'Bị khóa', null, { status: CompanyStatus.Suspended }),
    );
    const jobs = new FakeJobRepository().seed(
      makeJob(clock, { id: 1, companyId: 30 }),
      makeJob(clock, { id: 2, companyId: 31 }),
    );

    return { companies, jobs, service: new CompanyService(companies, jobs) };
  }

  it('trả hồ sơ công khai; công ty bị khóa hoặc không tồn tại trả 404', async () => {
    const { service } = await setup();

    await expect(service.getPublicProfile(30)).resolves.toEqual({
      id: 30,
      name: 'ABC',
      location: 'Hà Nội',
      website: 'https://abc.vn',
      description: null,
      status: CompanyStatus.Active,
    });
    await expect(service.getPublicProfile(32)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
    await expect(service.getPublicProfile(99)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
    // Chính chủ vẫn xem được hồ sơ khi công ty bị khóa.
    await expect(service.getOwnProfile(32)).resolves.toMatchObject({
      status: CompanyStatus.Suspended,
    });
  });

  it('cập nhật hồ sơ và đồng bộ bản chụp công ty trong các tin', async () => {
    const { service, jobs } = await setup();

    const updated = await service.updateProfile(30, {
      name: 'ABC Group',
      location: 'Đà Nẵng',
      description: 'Mô tả mới',
    });

    expect(updated).toMatchObject({
      name: 'ABC Group',
      location: 'Đà Nẵng',
      website: null,
    });
    expect((await jobs.getById(1))!.company).toMatchObject({
      name: 'ABC Group',
      location: 'Đà Nẵng',
    });
    // Tin của công ty khác không bị ảnh hưởng.
    expect((await jobs.getById(2))!.company!.name).toBe(
      'Công ty 30'.replace('30', '31'),
    );
  });

  it('từ chối tên trùng công ty khác nhưng cho giữ nguyên tên của mình', async () => {
    const { service } = await setup();

    await expect(
      service.updateProfile(30, { name: 'CÔNG TY KHÁC' }),
    ).rejects.toBeInstanceOf(CompanyNameAlreadyExistsException);
    await expect(
      service.updateProfile(30, { name: 'abc', description: 'x' }),
    ).resolves.toMatchObject({
      name: 'abc',
    });
  });

  it('báo không tìm thấy khi cập nhật công ty không tồn tại', async () => {
    const { service } = await setup();
    await expect(
      service.updateProfile(99, { name: 'X' }),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });
});
