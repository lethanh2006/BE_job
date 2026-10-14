import { ArgumentError, JobClosedException } from '../../domain';
import { InMemorySavedJobRepository } from '../../infrastructure/persistence/in-memory-saved-job-repository';
import {
  FakeJobRepository,
  makeJob,
  MutableClock,
} from '../../testing/test-helpers';
import { ResourceNotFoundException } from '../exceptions';
import { SavedJobService } from './saved-job.service';

describe('SavedJobService', () => {
  function setup() {
    const clock = new MutableClock();
    const job = makeJob(clock);
    const jobs = new FakeJobRepository().seed(job);
    const saved = new InMemorySavedJobRepository();
    return {
      clock,
      job,
      jobs,
      saved,
      service: new SavedJobService(saved, jobs, clock),
    };
  }

  it('tin hết hạn vẫn có trong danh sách cũ, không lưu mới, bỏ lưu được', async () => {
    const { clock, service } = setup();
    await service.save(20, 1);
    clock.advanceDays(8);
    expect((await service.list(20)).items[0]).toMatchObject({
      jobId: 1,
      availability: 'Expired',
      job: { id: 1 },
    });
    await expect(service.save(21, 1)).rejects.toBeInstanceOf(
      JobClosedException,
    );
    await expect(service.save(20, 1)).resolves.toBeUndefined();
    await service.remove(20, 1);
    expect((await service.list(20)).totalItems).toBe(0);
  });

  it('tin bị gỡ/khôi phục về bản nháp không lộ nội dung qua mục đã lưu', async () => {
    const { job, service } = setup();
    await service.save(20, 1);
    job.takeDown('Nội dung không phù hợp');
    expect((await service.list(20)).items[0]).toMatchObject({
      availability: 'Unavailable',
      job: null,
    });
    await expect(service.save(21, 1)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
    job.reinstate();
    expect((await service.list(20)).items[0].job).toBeNull();
    job.publish();
    expect((await service.list(20)).items[0].availability).toBe('Open');
  });

  it('sắp xếp ổn định khi trùng thời điểm; lưu lặp không đổi thứ tự; tách người dùng', async () => {
    const { clock, jobs, service } = setup();
    jobs.seed(makeJob(clock, { id: 2 }));
    await service.save(20, 1);
    await service.save(20, 2);
    clock.advanceDays(1);
    await service.save(20, 1);
    expect((await service.list(20, 1, 1)).items[0].jobId).toBe(2);
    expect((await service.list(20, 2, 1)).items[0].jobId).toBe(1);
    expect(await service.savedIds(21, [1, 2])).toEqual([]);
    expect(await service.savedIds(20, [2, 1, 2])).toEqual([1, 2]);
    await service.remove(21, 1);
    expect((await service.list(20)).totalItems).toBe(2);
    await expect(service.list(20, 1.5)).rejects.toBeInstanceOf(ArgumentError);
  });
});
