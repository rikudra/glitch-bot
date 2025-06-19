import { EmbedBuilder } from "discord.js";
import Notification from "../models/notification.mjs";
import { Client } from '@notionhq/client';
import fetch from 'node-fetch'; // node-fetchをインポート

// Notionクライアントの初期化
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  fetch: fetch // fetchを渡す
});

const databaseId = process.env.NOTION_DATABASE_ID;

export default async (oldState, newState) => {
  // ボイスチャンネルに入室した時
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
    
    // Notionに記録
    await addVoiceStateToNotion(
      newState.member.displayName,
      newState.channel.name,
      "入室",
      newState.guild.name
    );
  }
  // ボイスチャンネルから退出した時
  else if (oldState.channelId !== null && newState.channelId === null) {
    // Notionに記録
    await addVoiceStateToNotion(
      oldState.member.displayName,
      oldState.channel.name,
      "退出",
      oldState.guild.name
    );
  }
};

async function addVoiceStateToNotion(userName, channelName, eventType, guildName) {
  try {
    const response = await notion.pages.create({
      parent: {
        database_id: databaseId
      },
      properties: {
        名前: {
          title: [
            {
              text: {
                content: `${userName}が${channelName}に${eventType}`
              }
            }
          ]
        },
        ユーザー名: {
          rich_text: [
            {
              text: {
                content: userName
              }
            }
          ]
        },
        チャンネル名: {
          rich_text: [
            {
              text: {
                content: channelName
              }
            }
          ]
        },
        イベントタイプ: {
          select: {
            name: eventType
          }
        },
        サーバー名: {
          rich_text: [
            {
              text: {
                content: guildName
              }
            }
          ]
        },
        日時: {
          date: {
            start: new Date().toISOString()
          }
        }
      }
    });
    console.log('🎉 Notionにボイスチャンネルの状態を記録しました！ページID:', response.id);
  } catch (error) {
    console.error('💥 Notionへの記録エラー！', error.body || error);
  }
}
