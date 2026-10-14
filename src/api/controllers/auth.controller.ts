import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { LoginService } from '../../application/auth/login.service';
import { PasswordChangeService } from '../../application/auth/password-change.service';
import { PasswordResetService } from '../../application/auth/password-reset.service';
import { RegistrationService } from '../../application/auth/registration.service';
import { SessionService } from '../../application/auth/session.service';
import type { AuthenticatedUserDto } from '../../application/auth';
import { ApiProblems } from '../dto/api-responses';
import {
  AuthenticatedUserResponseDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  LoginResultResponseDto,
  RefreshTokenDto,
  RegisterCandidateDto,
  RegisterEmployerDto,
  ResetPasswordDto,
} from '../dto/auth.dto';
import { AuthPrincipal, CurrentUser, JwtAuthGuard } from '../auth/auth';

@ApiTags('Xác thực')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginService: LoginService,
    private readonly sessionService: SessionService,
    private readonly registrationService: RegistrationService,
    private readonly passwordChangeService: PasswordChangeService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập, nhận access token và refresh token' })
  @ApiOkResponse({ type: LoginResultResponseDto })
  @ApiProblems(HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED)
  login(@Body() body: LoginDto) {
    return this.loginService.login(body.email, body.password);
  }

  @Post('register/candidate')
  @ApiOperation({
    summary: 'Đăng ký tài khoản ứng viên',
    description:
      'Tạo đồng thời tài khoản và hồ sơ, rồi cấp phiên đăng nhập đầu tiên.',
  })
  @ApiCreatedResponse({ type: LoginResultResponseDto })
  @ApiProblems(HttpStatus.BAD_REQUEST, HttpStatus.CONFLICT)
  registerCandidate(@Body() body: RegisterCandidateDto) {
    return this.registrationService.registerCandidate(
      body.name,
      body.email,
      body.password,
    );
  }

  @Post('register/employer')
  @ApiOperation({
    summary: 'Đăng ký nhà tuyển dụng',
    description:
      'Tạo công ty mới cùng tài khoản quản lý công ty đó rồi cấp phiên đăng nhập đầu tiên.',
  })
  @ApiCreatedResponse({ type: LoginResultResponseDto })
  @ApiProblems(HttpStatus.BAD_REQUEST, HttpStatus.CONFLICT)
  registerEmployer(@Body() body: RegisterEmployerDto) {
    return this.registrationService.registerEmployer(body);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Làm mới phiên bằng refresh token',
    description:
      'Refresh token xoay vòng: mỗi token dùng được một lần. Dùng lại token đã thu hồi sẽ thu hồi toàn bộ phiên cùng họ token.',
  })
  @ApiOkResponse({ type: LoginResultResponseDto })
  @ApiProblems(HttpStatus.UNAUTHORIZED)
  refresh(@Body() body: RefreshTokenDto) {
    return this.sessionService.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đăng xuất, thu hồi refresh token hiện tại' })
  @ApiNoContentResponse()
  async logout(@Body() body: RefreshTokenDto): Promise<void> {
    await this.sessionService.logout(body.refreshToken);
  }

  @Put('password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đổi mật khẩu',
    description: 'Thu hồi toàn bộ phiên đăng nhập hiện có của tài khoản.',
  })
  @ApiNoContentResponse()
  @ApiProblems(HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED)
  async changePassword(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: ChangePasswordDto,
  ): Promise<void> {
    await this.passwordChangeService.change(
      user.id,
      body.currentPassword,
      body.newPassword,
    );
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Yêu cầu liên kết đặt lại mật khẩu',
    description:
      'Luôn trả 202 dù email có tồn tại hay không, để không lộ tài khoản nào đang có. Nếu tài khoản tồn tại và đang hoạt động, email chứa liên kết dùng một lần (có thời hạn) được gửi đi; liên kết cũ bị vô hiệu hóa và mỗi tài khoản nhận tối đa 3 email mỗi giờ.',
  })
  @ApiAcceptedResponse({ description: 'Yêu cầu đã được tiếp nhận.' })
  @ApiProblems(HttpStatus.BAD_REQUEST)
  async forgotPassword(@Body() body: ForgotPasswordDto): Promise<void> {
    await this.passwordResetService.requestReset(body.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Đặt lại mật khẩu bằng liên kết trong email',
    description:
      'Token chỉ dùng được một lần. Thành công thì mọi phiên đăng nhập hiện có của tài khoản bị thu hồi. Token sai, đã dùng hoặc hết hạn đều trả cùng một lỗi 400.',
  })
  @ApiNoContentResponse()
  @ApiProblems(HttpStatus.BAD_REQUEST)
  async resetPassword(@Body() body: ResetPasswordDto): Promise<void> {
    await this.passwordResetService.resetPassword(body.token, body.newPassword);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thông tin người dùng hiện tại' })
  @ApiOkResponse({ type: AuthenticatedUserResponseDto })
  @ApiProblems(HttpStatus.UNAUTHORIZED)
  me(@CurrentUser() user: AuthPrincipal): AuthenticatedUserDto {
    return { ...user };
  }
}
