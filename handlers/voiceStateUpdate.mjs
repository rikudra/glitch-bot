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

// Notionにファイルをアップロードし、そのURLを返す関数
async function uploadFileToNotion(fileBuffer, fileName, contentType) {
  try {
    // 1. ファイルアップロードセッションを作成
    const createResponse = await notion.files.create({
      mode: 'public', // または 'private'
      filename: fileName,
      content_type: contentType,
      number_of_parts: 1, // 単一パートアップロード
    });

    const { id: fileUploadId, upload_url, upload_headers } = createResponse;

    // 2. 取得したURLにファイルをアップロード
    const uploadResponse = await fetch(upload_url, {
      method: 'PUT', // PUTメソッドでアップロード
      headers: upload_headers,
      body: fileBuffer,
    });

    if (!uploadResponse.ok) {
      throw new Error(`ファイルアップロードエラー: ${uploadResponse.statusText}`);
    }

    // 3. アップロード完了を通知
    await notion.files.complete({
      file_upload_id: fileUploadId,
    });

    // 4. アップロードされたファイル情報を取得
    const fileInfo = await notion.files.retrieve({
      file_upload_id: fileUploadId,
    });

    if (fileInfo.type === 'file') {
      return fileInfo.file.url;
    } else {
      console.error('💥 アップロードされたファイルのURLが取得できませんでした。');
      return null;
    }

  } catch (error) {
    console.error('💥 Notionへのファイルアップロードエラー！', error.body || error);
    return null;
  }
}

// Notionユーザーデータベースにユーザーを追加する関数
async function addUserToNotion(userName, userAvatarUrl) {
  let iconUrl = userAvatarUrl; // デフォルトは外部URL

  // アバター画像をダウンロードしてNotionにアップロード
  const imageBuffer = await getImageBufferFromUrl(userAvatarUrl);
  if (imageBuffer) {
    const uploadedUrl = await uploadFileToNotion(imageBuffer, `${userName}_avatar.png`, 'image/png');
    if (uploadedUrl) {
      iconUrl = uploadedUrl;
    }
  }

  try {
    const response = await notion.pages.create({
      parent: {
        database_id: process.env.NOTION_USER_DB_ID,
      },
      icon: {
        type: "file", // ファイルタイプに変更
        file: {
          url: iconUrl,
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
  let iconUrl = userAvatarUrl; // デフォルトは外部URL

  // アバター画像をダウンロードしてNotionにアップロード
  const imageBuffer = await getImageBufferFromUrl(userAvatarUrl);
  if (imageBuffer) {
    const uploadedUrl = await uploadFileToNotion(imageBuffer, `${userName}_avatar.png`, 'image/png');
    if (uploadedUrl) {
      iconUrl = uploadedUrl;
    }
  }

  try {
    const response = await notion.pages.create({
      parent: {
        database_id: databaseId
      },
      icon: {
        type: "file", // ファイルタイプに変更
        file: {
          url: iconUrl,
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
