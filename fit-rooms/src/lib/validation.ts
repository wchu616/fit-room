import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateString(value: string) {
  if (!dateRegex.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export const loginSchema = z.object({
  username: z.string().min(3, "用户名至少 3 个字符").max(32, "用户名最多 32 个字符"),
  password: z.string().min(6, "密码至少 6 个字符").max(72, "密码最多 72 个字符"),
});

export const createPlanSchema = z
  .object({
    title: z.string().trim().min(2, "计划标题至少 2 个字符").max(100, "计划标题最多 100 个字符"),
    details: z.any().optional(),
    start_date: z.string().refine(isValidDateString, "开始日期格式应为 YYYY-MM-DD"),
    end_date: z.string().refine(isValidDateString, "结束日期格式应为 YYYY-MM-DD").optional(),
  })
  .refine((data) => {
    if (!data.end_date) return true;
    return data.end_date >= data.start_date;
  }, {
    message: "结束日期不能早于开始日期",
    path: ["end_date"],
  });

export const updatePlanSchema = createPlanSchema
  .partial()
  .refine((data) => {
    if (data.start_date && !isValidDateString(data.start_date)) return false;
    if (data.end_date && !isValidDateString(data.end_date)) return false;
    if (data.start_date && data.end_date) {
      return data.end_date >= data.start_date;
    }
    return true;
  }, {
    message: "结束日期不能早于开始日期",
    path: ["end_date"],
  });

export const planOverrideSchema = z.object({
  reason: z.enum(["period", "weather", "other"]),
  forDate: z.string().refine(isValidDateString, "日期格式应为 YYYY-MM-DD").optional(),
});

export const createRoomSchema = z.object({
  name: z.string().trim().min(2, "房间名称至少 2 个字符").max(50, "房间名称最多 50 个字符"),
});

export const joinRoomSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "请输入房间码")
    .regex(/^[A-Z0-9]{6}$/, "房间码应为 6 位大写字母或数字"),
});

export const leaveRoomSchema = z.object({
  roomId: z.string().uuid("房间 ID 无效"),
});

export const signupSchema = loginSchema
  .extend({
    confirmPassword: z.string(),
    timezone: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

export const roomIdParamSchema = z.object({
  id: z.string().uuid("房间 ID 无效"),
});

export const removeRoomMemberSchema = z.object({
  userId: z.string().uuid("用户 ID 无效"),
});

export const createTeamSchema = z.object({
  roomId: z.string().uuid("房间 ID 无效"),
  name: z.string().trim().min(2, "队伍名称至少 2 个字符").max(50, "队伍名称最多 50 个字符"),
});

export const joinTeamSchema = z.object({
  teamId: z.string().uuid("队伍 ID 无效"),
});

export const leaveTeamSchema = z.object({
  teamId: z.string().uuid("队伍 ID 无效"),
});

export const teamListQuerySchema = z.object({
  roomId: z.string().uuid("房间 ID 无效"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
export type LeaveRoomInput = z.infer<typeof leaveRoomSchema>;
export type RoomIdParamInput = z.infer<typeof roomIdParamSchema>;
export type RemoveRoomMemberInput = z.infer<typeof removeRoomMemberSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type JoinTeamInput = z.infer<typeof joinTeamSchema>;
export type LeaveTeamInput = z.infer<typeof leaveTeamSchema>;
export type TeamListQueryInput = z.infer<typeof teamListQuerySchema>;
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type PlanOverrideInput = z.infer<typeof planOverrideSchema>;
