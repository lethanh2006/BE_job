# JobBoard Backend (NestJS)

Bản chuyển đổi backend JobBoard từ ASP.NET Core (`BE_c#`) sang NestJS + TypeScript.
Giữ nguyên kiến trúc phân lớp, route, JSON contract và quy tắc nghiệp vụ để frontend
(`fe/`) dùng được mà không cần sửa.

## Cấu trúc

```text
src/
  domain/          Entity, value object, exception và quy tắc nghiệp vụ (không phụ thuộc framework)
  application/     Use case (service), DTO và abstraction (abstract class dùng làm DI token)
  infrastructure/  Triển khai cụ thể: repository in-memory và PostgreSQL (pg + migration), PBKDF2, refresh token, JWT
  api/             Controller, DTO request, guard xác thực/phân quyền, bộ lọc lỗi ProblemDetails
  config/          Đọc cấu hình từ biến môi trường
  data/seed/       Dữ liệu tin tuyển dụng mẫu (jobs.json)
test/              E2E test (supertest)
```

Chiều phụ thuộc: `api → application → domain`, `infrastructure → application → domain`.
`domain` không import gì từ các lớp khác.

## Chạy

Yêu cầu Node.js 22.12+ và npm. Docker chỉ cần khi dùng PostgreSQL.

```bash
npm install
cp .env.example .env     # tùy chọn; có giá trị mặc định cho môi trường dev
npm run start:dev        # InMemory, http://localhost:5000/api
```

Chạy với PostgreSQL:

```bash
npm run db:up            # PostgreSQL 17 ở localhost:5434 (docker compose)
npm run start:pg         # PERSISTENCE_PROVIDER=PostgreSql + tự áp migration và seed
```

Tài liệu API: Swagger UI tại <http://localhost:5000/api/docs>, OpenAPI JSON tại
`/api/openapi.json` (bật mặc định ngoài production, tắt bằng `OPENAPI_ENABLED=false`).

Kiểm tra:

```bash
npm run build
npm test                 # unit test (không cần DB)
npm run test:e2e         # e2e toàn bộ luồng API với repository in-memory
npm run test:e2e:pg      # chạy lại e2e + kiểm thử tầng lưu trữ trên PostgreSQL thật (cần db:up)
npm run lint
```

## Cấu hình

Đọc từ biến môi trường (hoặc file `.env`), xem [.env.example](.env.example).

| Biến | Mặc định (dev) | Ghi chú |
| --- | --- | --- |
| `PORT` | `5000` | Frontend mặc định gọi `http://localhost:5000/api` |
| `JWT_SIGNING_KEY` | khóa dev | Tối thiểu 32 byte; **bắt buộc** khi `NODE_ENV=production`, thiếu thì app không khởi động |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `JobBoard.Api` / `JobBoard.Web` | |
| `JWT_ACCESS_TOKEN_MINUTES` | `15` | |
| `JWT_REFRESH_TOKEN_DAYS` | `7` | |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | Danh sách origin, ngăn cách bằng dấu phẩy |
| `PERSISTENCE_PROVIDER` | `InMemory` | `InMemory` hoặc `PostgreSql` |
| `DATABASE_URL` | URL dev ở cổng 5434 | Bắt buộc khi `NODE_ENV=production` và dùng PostgreSql |
| `PERSISTENCE_APPLY_MIGRATIONS` | `false` | `true`: áp migration và nạp dữ liệu mẫu cho bảng còn trống khi khởi động |
| `OPENAPI_ENABLED` | bật ngoài production | Phát `/api/docs` và `/api/openapi.json` |

## Tài khoản demo

Seed khi khởi động (mật khẩu `JobBoard@123`):

| Vai trò | Email |
| --- | --- |
| Candidate | `candidate@jobboard.vn` |
| Employer (công ty 1) | `employer@jobboard.vn` |
| Admin | `admin@jobboard.vn` |

Mật khẩu lưu dạng PBKDF2-SHA256 (210.000 vòng, định dạng `v1.<vòng>.<salt>.<hash>`,
cùng định dạng với backend C#). Đăng nhập trả access token JWT 15 phút và refresh token
xoay vòng 7 ngày; chỉ hash SHA-256 của refresh token được lưu, và việc dùng lại token cũ
sẽ thu hồi toàn bộ phiên cùng họ token.

## API

Tất cả route nằm dưới tiền tố `/api`.

- `GET /health`
- `GET /jobs` (lọc `keyword`, `location`, `category`, `level`, `minimumSalary`, `skills` lặp lại, `page`, `pageSize`, `sort`), `GET /jobs/categories`, `GET /jobs/:id` (bản nháp trả 404), `GET /companies/:id` (hồ sơ công khai; tin của công ty: `GET /jobs?companyId=`)
- `POST /auth/login`, `POST /auth/register/candidate`, `POST /auth/register/employer` (tạo công ty + tài khoản quản lý), `POST /auth/refresh`, `POST /auth/logout`, `PUT /auth/password`, `GET /auth/me`
- `POST /applications` (Candidate), `PATCH /applications/:id/status` (Employer)
- `GET /notifications` (`unreadOnly`, `page`, `pageSize`), `GET /notifications/unread-count`,
  `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` (đã đăng nhập, chỉ dữ liệu của chính mình)
- `GET|PUT /candidates/:id/profile`, `GET /candidates/:id/applications`, `GET /candidates/:id/job-matches?jobIds=1,2`, `GET /candidates/:id/recommended-jobs` (Candidate, chỉ của chính mình)
- `GET /admin/stats`, `GET /admin/jobs|companies|users|audit-logs`, `POST /admin/jobs/:id/takedown|reinstate`, `POST /admin/companies/:id/suspend|reactivate`, `POST /admin/users/:id/disable|enable` (Admin)
- `GET|POST /employers/:companyId/jobs`, `GET|PUT /employers/:companyId/jobs/:jobId`, `POST .../jobs/:jobId/publish|close`, `GET /employers/:companyId/applications`, `GET /employers/:companyId/applications/:id`, `GET|PUT /employers/:companyId/company` (Employer, đúng công ty trong token)

Lỗi trả về dạng `application/problem+json` (`status`, `title`, `detail`, `instance`).

## Tìm kiếm và độ phù hợp

- **Tìm kiếm** đi qua `JobSearchReader` (phía đọc): lọc, sắp xếp và phân trang diễn ra ở nơi lưu trữ và chỉ
  đọc các cột của thẻ việc làm. Từ khóa, địa điểm, lĩnh vực và kỹ năng so khớp **không phân biệt hoa thường và
  dấu tiếng Việt** (`ha noi` khớp `Hà Nội`). Bản in-memory dùng `foldText`, bản PostgreSQL dùng hàm `vn_fold`
  (`unaccent`), có test so khớp hai bản.
- **Đo trước khi tối ưu** (50.000 tin, PostgreSQL 17, mỗi truy vấn lấy trang đầu 10 tin): tải toàn bộ tin rồi
  lọc trong bộ nhớ mất ~9.700 ms/request. Chuyển sang SQL còn 50–240 ms; thêm cột chuẩn hóa `search_text` +
  index trigram và `skills_folded` + GIN (migration `0002`) còn ~7 ms với từ khóa hiếm, ~12 ms khi lọc kỹ năng,
  ~46 ms với từ khóa phổ biến (quét tuần tự, khớp 12% số dòng).
- **Độ phù hợp** (`JobMatchService`) = 70% độ trùng kỹ năng + 30% khoảng lương giao nhau, được ghép bằng
  `CompositeScorer` + `WeightedScorer`. Dùng cho danh sách ứng viên của nhà tuyển dụng, điểm từng tin của ứng
  viên (`job-matches`) và gợi ý việc làm (`recommended-jobs`, chọn trong 100 tin đang tuyển mới nhất).

## Kiểm duyệt (quản trị viên)

- **Gỡ tin** (`takedown`): tin sang trạng thái `Removed` kèm lý do, biến mất khỏi tìm kiếm và trang chi tiết công
  khai; nhà tuyển dụng thấy lý do nhưng không sửa/đăng được. **Khôi phục** (`reinstate`) đưa tin về bản nháp để
  nhà tuyển dụng xem lại và đăng lại. Đơn ứng tuyển cũ được giữ nguyên.
- **Khóa công ty** (`suspend`): mọi tin của công ty bị ẩn khỏi tìm kiếm/chi tiết công khai, trang công ty trả 404 và
  công ty không tạo/đăng tin mới được. Tìm kiếm lọc theo trạng thái công ty ngay trong SQL nên có hiệu lực tức thì.
- **Khóa tài khoản** (`disable`): thu hồi mọi refresh token, đăng nhập trả 403 (chỉ báo "bị khóa" sau khi đúng mật
  khẩu để không lộ tài khoản nào tồn tại). Access token đã cấp còn hiệu lực tối đa `JWT_ACCESS_TOKEN_MINUTES` phút.
  Không khóa được chính mình hoặc quản trị viên khác.
- Mọi thao tác ghi vào `audit_logs` (ai, làm gì, lúc nào, lý do) và đọc lại qua `GET /admin/audit-logs`.
- Các màn hình liệt kê/thống kê đi qua `AdminReader` (phía đọc, lọc/đếm/phân trang trong SQL); có test so khớp
  PostgreSQL với bản in-memory trên cùng một kịch bản.

## Thông báo trong ứng dụng

- Ứng tuyển thành công báo cho các tài khoản nhà tuyển dụng đang hoạt động của
  công ty; đổi trạng thái đơn báo cho ứng viên. Gửi lại cùng trạng thái không tạo
  thêm thông báo. Gỡ/khôi phục tin và khóa/mở khóa công ty báo cho nhà tuyển dụng,
  kèm lý do kiểm duyệt khi có.
- Khi đăng tin, chọn tối đa 300 hồ sơ có kỹ năng liên quan theo mã tăng dần, chấm
  điểm bằng `JobMatchService`, rồi gửi cho tối đa 100 ứng viên trong nhóm này có
  điểm từ 70 trở lên. Đây là nhóm gợi ý có giới hạn, không phải tìm top trên toàn
  bộ ứng viên. Tin không yêu cầu kỹ năng không phát thông báo gợi ý.
- API lấy người nhận từ JWT, không nhận `userId` từ client. Đánh dấu thông báo
  của người khác trả 404; đánh dấu từng mục/tất cả có thể gọi lặp lại. Danh sách
  sắp theo thời điểm và mã giảm dần để phân trang ổn định.
- `ApplicationNotifier` tách use case khỏi kênh gửi. `NotificationService` phát
  sau khi lưu nghiệp vụ; lỗi phát được ghi log và không làm thất bại thao tác đã
  lưu. Hiện chưa có hàng đợi, cơ chế thử lại hay bảo đảm giao thông báo khi tiến
  trình bị dừng giữa chừng. Kênh hiện tại chỉ lưu trong ứng dụng, chưa gửi email.
- Migration `0005_notifications` tạo bảng cùng index người nhận/chưa đọc và cột
  kỹ năng chuẩn hóa có GIN index cho ứng viên. Có repository InMemory và PostgreSQL;
  PostgreSQL lưu cả thông báo và trạng thái đã đọc qua các lần khởi động.
- `test/notifications.e2e-spec.ts` chạy cùng kịch bản trên hai provider: phát theo
  nghiệp vụ, phân quyền, chống gửi lại tuần tự, phân trang, lọc và đánh dấu đã đọc.
  Unit test kiểm tra giới hạn người nhận và lỗi thông báo không làm hỏng nghiệp vụ.

## Cơ sở dữ liệu

Truy cập PostgreSQL bằng `pg` với SQL tham số hóa, không dùng ORM: mapping giữa dòng dữ liệu
và entity domain nằm trong `infrastructure/postgres/row-mapper.ts`. Lược đồ tương đương
migration EF Core của backend C# (sequence cấp mã `job_ids`/`application_ids`/`user_ids`,
unique chống ứng tuyển trùng, index `(status, deadline)`, khóa ngoại).

- Migration là các module TypeScript trong `infrastructure/postgres/migrations/`, đăng ký ở
  `migrator.ts`. Chỉ thêm migration mới ở cuối danh sách, không sửa migration đã phát hành.
  Tất cả migration chưa chạy được áp trong một giao dịch, có khóa advisory để nhiều
  instance khởi động cùng lúc không đụng nhau.
- Giao dịch (`Database.transaction`) dùng cho đăng ký (tài khoản + hồ sơ ứng viên, hoặc công ty + tài khoản nhà tuyển dụng) và xoay refresh token.
- Công ty là bảng riêng (`companies`, migration `0003`). Tên công ty duy nhất không phân biệt hoa thường; `jobs.company_name/location` giữ làm bản chụp để tìm kiếm có index và được đồng bộ khi công ty đổi hồ sơ, còn `user_accounts` đọc tên công ty qua JOIN. Migration 0003 có test chạy trên dữ liệu cũ (gồm trường hợp tên công ty trùng).
- Các tình huống chạy song song (ứng tuyển trùng, xoay token đồng thời) được chặn bằng ràng
  buộc/điều kiện ở chính câu lệnh SQL và có test tích hợp (`test/postgres.e2e-spec.ts`).

## Khác biệt so với backend C#

- Truy cập dữ liệu bằng `pg` + SQL tay thay cho EF Core; migration viết bằng TypeScript.
- Email hồ sơ và email tài khoản được so khớp không phân biệt hoa thường (unique index trên `lower(email)`).
- `GET /jobs/:id` không trả bản nháp (bản C# trả mọi tin, kể cả chưa đăng); thêm `status`, `expired` vào chi tiết tin.
- Tìm kiếm không phân biệt dấu tiếng Việt và lọc/phân trang ở tầng lưu trữ thay vì tải toàn bộ tin.
- Có đăng ký nhà tuyển dụng (bản C# chỉ có tài khoản demo) và bảng công ty; bản chụp công ty trong tin lấy từ hồ sơ công ty thay vì dùng địa điểm của tin.
- Tên ứng viên trong danh sách đơn ứng tuyển lấy từ repository ứng viên thay vì bảng tên cố định.
- Đổi email hồ sơ trùng ứng viên khác trả 409 (bản C# trả 500); vượt giới hạn số kỹ năng trả 400.
