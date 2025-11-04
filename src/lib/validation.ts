
export const roomIdParamSchema = z.object({
  id: z.string({ required_error: "缺少房间 ID" }).uuid("房间 ID 无效")
});

export const removeRoomMemberSchema = z.object({
  userId: z.string({ required_error: "缺少用户 ID" }).uuid("用户 ID 无效")
});

export const createTeamSchema = z.object({
  roomId: z.string({ required_error: "缺少房间 ID" }).uuid(),
  name: z
    .string({ required_error: "请输入队伍名称" })
    .min(2, "队伍名称至少 2 个字符")
    .max(50, "队伍名称最多 50 个字符"),
});

export const joinTeamSchema = z.object({
  teamId: z.string({ required_error: "缺少队伍 ID" }).uuid(),
});

export const leaveTeamSchema = z.object({
  teamId: z.string({ required_error: "缺少队伍 ID" }).uuid(),
});

export const teamListQuerySchema = z.object({
  roomId: z.string({ required_error: "缺少房间 ID" }).uuid(),
});

export type RemoveRoomMemberInput = z.infer<typeof removeRoomMemberSchema>;
export type RoomIdParamInput = z.infer<typeof roomIdParamSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type JoinTeamInput = z.infer<typeof joinTeamSchema>;
export type LeaveTeamInput = z.infer<typeof leaveTeamSchema>;
export type TeamListQueryInput = z.infer<typeof teamListQuerySchema>;

