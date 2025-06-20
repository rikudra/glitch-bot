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
  const member = newState.member || oldState.member;
  const userName = member.displayName;
  const userAvatarUrl = member.displayAvatarURL({ format: 'png', size: 128 });
  const guildName = newState.guild?.name || oldState.guild?.name;

  // ボイスチャンネルに入室した時
  if (oldState.channelId === null && newState.channelId !== null) {
    // Notionユーザーデータベースにユーザーが存在するか確認し、存在しない場合は追加
    const userExists = await checkUserExistsInNotion(userName);
    if (!userExists) {
      await addUserToNotion(userName, userAvatarUrl);
    }

    const notifications = await Notification.findAll({
      where: {
        guildId: newState.guild.id,
        voiceChannelId: newState.channel.id,
      },
    });
    
    const embed = new EmbedBuilder()
      .setColor(0x5cb85c)
      .setAuthor({ name: userName, iconURL: userAvatarUrl})
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
      userName,
      newState.channel.name,
      "入室",
      guildName,
      userAvatarUrl
    );
  }
  // ボイスチャンネルから退出した時
  else if (oldState.channelId !== null && newState.channelId === null) {
    // Notionに記録
    await addVoiceStateToNotion(
      userName,
      oldState.channel.name,
      "退出",
      guildName,
      userAvatarUrl
    );
  }
  // ボイスチャンネルを移動した時
  else if (oldState.channelId !== null && newState.channelId !== null && oldState.channelId !== newState.channelId) {
    // 移動元チャンネルからの退出を記録
    await addVoiceStateToNotion(
      userName,
      oldState.channel.name,
      "退出",
      guildName,
      userAvatarUrl
    );
    // 移動先チャンネルへの入室を記録
    await addVoiceStateToNotion(
      userName,
      newState.channel.name,
      "入室",
      guildName,
      userAvatarUrl
    );
  }

  // ミュート状態が変更された時
  if (oldState.selfMute !== newState.selfMute) {
    const eventType = newState.selfMute ? "ミュート" : "ミュート解除";
    await addVoiceStateToNotion(
      userName,
      newState.channel?.name || oldState.channel?.name,
      eventType,
      guildName,
      userAvatarUrl
    );
  }

  // 画面共有状態が変更された時
  if (oldState.streaming !== newState.streaming) {
    const eventType = newState.streaming ? "画面共有開始" : "画面共有終了";
    await addVoiceStateToNotion(
      userName,
      newState.channel?.name || oldState.channel?.name,
      eventType,
      guildName,
      userAvatarUrl
    );
  }

  // カメラ状態が変更された時
  if (oldState.selfVideo !== newState.selfVideo) {
    const eventType = newState.selfVideo ? "カメラオン" : "カメラオフ";
    await addVoiceStateToNotion(
      userName,
      newState.channel?.name || oldState.channel?.name,
      eventType,
      guildName,
      userAvatarUrl
    );
  }
};

// Notionユーザーデータベースにユーザーが存在するか確認する関数
async function checkUserExistsInNotion(userName) {
  try {
    const response = await notion.databases.query({
      database_id: process.env.NOTION_USER_DB_ID,
      filter: {
        property: '名前', // Notionデータベースのプロパティ名に合わせて変更
        title: {
          equals: userName,
        },
      },
    });
    return response.results.length > 0;
  } catch (error) {
    console.error('💥 NotionユーザーDBの存在確認エラー！', error.body || error);
    return false;
  }
}

// Notionユーザーデータベースにユーザーを追加する関数
async function addUserToNotion(userName, userAvatarUrl) {
  try {
    const response = await notion.pages.create({
      parent: {
        database_id: process.env.NOTION_USER_DB_ID,
      },
      icon: {
        type: "external",
        external: {
          url: userAvatarUrl
        }
      },
      properties: {
        名前: { // Notionデータベースのプロパティ名に合わせて変更
          title: [
            {
              text: {
                content: userName,
              },
            },
          ],
        },
        種類: { // Notionデータベースのプロパティ名に合わせて変更
          select: {
            name: 'ユーザー', // 画像で確認した「ユーザー」
          },
        },
      },
    });
    console.log('🎉 NotionユーザーDBに新しいユーザーを記録しました！ページID:', response.id);
  } catch (error) {
    console.error('💥 NotionユーザーDBへの記録エラー！', error.body || error);
  }
}

async function addVoiceStateToNotion(userName, channelName, eventType, guildName, userAvatarUrl) {
  try {
    const response = await notion.pages.create({
      parent: {
        database_id: databaseId
      },
      icon: {
        type: "external",
        external: {
          url: userAvatarUrl
        }
      },
      properties: {
        名前: {
          title: [
            {
              text: {
                content: `【${channelName}】${userName}が${eventType}`
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
            start: getJSTISOString()
          }
        }
      }
    });
    console.log('🎉 Notionにボイスチャンネルの状態を記録しました！ページID:', response.id);
  } catch (error) {
    console.error('💥 Notionへの記録エラー！', error.body || error);
  }
}

function getJSTISOString() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60 * 1000; // UTCからのミリ秒単位のオフセット
  const jstOffset = 9 * 60 * 60 * 1000; // JSTのオフセット (9時間)
  const jstTime = new Date(now.getTime() + offset + jstOffset);
  return jstTime.toISOString().slice(0, -1) + '+09:00'; // 末尾の'Z'を'+09:00'に置換
}

