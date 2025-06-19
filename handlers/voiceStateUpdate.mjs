import { EmbedBuilder } from "discord.js";
import Notification from "../models/notification.mjs";
import { recordVoiceActivity } from "../commands/utils/notion.mjs";

export default async (oldState, newState) => {
  // ユーザーがボイスチャンネルに参加したとき
  if (oldState.channelId === null && newState.channelId !== null) {
    const notifications = await Notification.findAll({
      where: {
        guildId: newState.guild.id,
        voiceChannelId: newState.channel.id,
      },
    });
    
    const embed = new EmbedBuilder()
      .setColor(0x5cb85c)
      .setAuthor({ name: newState.member.displayName, iconURL: newState.member.displayAvatarURL()})
      .setTitle(`<#${newState.channel.id}> で通話を開始しました！`)
      .setTimestamp();
    
    await Promise.all(
      notifications.map(async n => {
        const channel = await newState.guild.channels.fetch(n.textChannelId);
        await channel.send({ embeds: [embed] });
      })
    );
    recordVoiceActivity(newState.member, newState.channel, "参加");
  }
  // ユーザーがボイスチャンネルから退出したとき
  else if (oldState.channelId !== null && newState.channelId === null) {
    recordVoiceActivity(oldState.member, oldState.channel, "退出");
  }
};
