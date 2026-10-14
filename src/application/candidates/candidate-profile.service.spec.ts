import { ArgumentError, Candidate, SalaryRange, Skill } from '../../domain';
import { InMemoryCandidateFileRepository } from '../../infrastructure/persistence/in-memory-candidate-file-repository';
import { InMemoryJobApplicationRepository } from '../../infrastructure/persistence/in-memory-job-application-repository';
import { InMemoryCandidateRepository } from '../../infrastructure/persistence/in-memory-candidate-repository';
import { ResourceNotFoundException } from '../exceptions';
import { CandidateProfileService } from './candidate-profile.service';

describe('CandidateProfileService', () => {
  async function setup() {
    const repository = new InMemoryCandidateRepository();
    const candidate = new Candidate(
      20,
      'An',
      'an@x.vn',
      'bio',
      new SalaryRange(1000, 2000),
    );
    candidate.addSkill(new Skill('Docker'));
    await repository.add(candidate);
    return {
      repository,
      service: new CandidateProfileService(
        repository,
        new InMemoryCandidateFileRepository(
          new InMemoryJobApplicationRepository(),
        ),
      ),
    };
  }

  it('trả hồ sơ với kỹ năng sắp xếp không phân biệt hoa thường', async () => {
    const { service, repository } = await setup();
    (await repository.getById(20))!.addSkill(new Skill('azure'));

    expect(await service.getById(20)).toEqual({
      id: 20,
      name: 'An',
      email: 'an@x.vn',
      bio: 'bio',
      desiredSalaryMin: 1000,
      desiredSalaryMax: 2000,
      skills: ['azure', 'Docker'],
      cv: null,
    });
  });

  it('cập nhật email, bio, lương và thay toàn bộ kỹ năng', async () => {
    const { service, repository } = await setup();

    const profile = await service.update(20, {
      email: 'moi@x.vn',
      bio: ' mới ',
      desiredSalaryMin: 1500,
      desiredSalaryMax: 3000,
      skills: ['Go', 'go', 'Rust'],
    });

    expect(profile).toMatchObject({
      email: 'moi@x.vn',
      bio: 'mới',
      desiredSalaryMin: 1500,
      skills: ['Go', 'Rust'],
    });
    expect((await repository.getById(20))!.skills).toHaveLength(2);
  });

  it('cho phép xóa khoảng lương nhưng từ chối khoảng thiếu một đầu', async () => {
    const { service } = await setup();

    const cleared = await service.update(20, { email: 'an@x.vn', skills: [] });
    expect(cleared.desiredSalaryMin).toBeNull();

    await expect(
      service.update(20, { email: 'an@x.vn', desiredSalaryMin: 1, skills: [] }),
    ).rejects.toBeInstanceOf(ArgumentError);
  });

  it('báo không tìm thấy ứng viên', async () => {
    const { service } = await setup();
    await expect(service.getById(999)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });
});
