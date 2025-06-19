import { Client } from "@notionhq/client";

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

const notion = new Client({ auth: NOTION_API_KEY });

export async function recordVoiceActivity(member, channel, type) {
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
    console.warn("Notion API Key or Database ID is not set. Skipping Notion recording.");
    return;
  }

  try {
    await notion.pages.create({
      parent: { database_id: NOTION_DATABASE_ID },
      properties: {
        "ユーザー名": {
          title: [
            {
              text: {
                content: member.displayName,
              },
            },
          ],
        },
        "チャンネル名": {
          rich_text: [
            {
              text: {
                content: channel.name,
              },
            },
          ],
        },
        "イベントタイプ": {
          select: {
            name: type,
          },
        },
        "タイムスタンプ": {
          date: {
            start: new Date().toISOString(),
          },
        },
      },
    });
    console.log(`Notionにボイスアクティビティを記録しました: ${member.displayName} ${type} ${channel.name}`);
  } catch (error) {
    console.error("Notionへの記録中にエラーが発生しました:", error);
  }
}