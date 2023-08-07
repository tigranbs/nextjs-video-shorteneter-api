import { NextApiRequest, NextApiResponse } from 'next';
import ytdl from 'ytdl-core';
import { YoutubeTranscript } from 'youtube-transcript';
import fsSync, { promises as fs } from 'fs';
import path from 'path';
import url from 'url';
import ffmpeg from 'fluent-ffmpeg';

const videoDir = 'videos';

// Make sure the video directory exists
if (!fsSync.existsSync(videoDir)) {
  fsSync.mkdirSync(videoDir);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { videoId, videoUrl, chunks } = req.body as { videoId: string; videoUrl: string; chunks: {start: number, duration: number}[] };

  if (typeof videoId !== 'string' && typeof videoUrl !== 'string') {
    res.status(400).send('Either video ID or video URL must be provided');
    return;
  }

  try {
    const { videoFilename, transcriptFilename } = await videoDownload({ videoId, videoUrl });

    const videoSplitFiles = await Promise.all(chunks.map(async ({ start, duration }) => videoSplitter(videoFilename, Number(start), Number(duration))));

    res.status(200).json({
      videoFilename,
      transcriptFilename,
      videoSplitFiles,
      message: 'Files downloaded successfully',
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while downloading the video and transcript.');
  }
}

async function videoDownload(opts: {videoId: string, videoUrl?: string}): Promise<{ videoFilename: string, transcriptFilename: string }> {
  const { videoId, videoUrl } = opts;
  return new Promise((resolve, reject) => {
    // Extract video ID from URL if provided
    let finalVideoId = videoId;
    if (videoUrl) {
      const parsedUrl = url.parse(videoUrl.toString(), true);
      const queryParameters = parsedUrl.query;
      finalVideoId = queryParameters['v'] as string;
    }

    if (!finalVideoId) {
      reject('Invalid video ID or URL');
      return;
    }

    // Generate filenames for video and transcript
    const fileId = finalVideoId.toString();
    const videoFilename = path.join(videoDir, fileId + '.mp4');
    const transcriptFilename = path.join(videoDir, fileId + '.json');

    // Download video
    const videoStream = ytdl(`https://www.youtube.com/watch?v=${videoId}`);

    videoStream.pipe(fsSync.createWriteStream(videoFilename)).on('close', async () => {
      const transcripts = await YoutubeTranscript.fetchTranscript(finalVideoId.toString());
      await fs.writeFile(transcriptFilename, JSON.stringify(transcripts));

      resolve({
        videoFilename,
        transcriptFilename,
      });
    });
  });
}

async function videoSplitter(filename: string, start: number, duration: number): Promise<string> {
  const outputFilename = `${filename}-${start}-${duration}.mp4`;
  return new Promise((resolve, reject) => {
    ffmpeg(filename)
      .setStartTime(start)
      .setDuration(duration)
      .outputOptions('-c copy')
      .on('end', () => {
        resolve(outputFilename);
      })
      .on('error', (err) => {
        console.log('Error while splitting', err);
        reject(err);
      })
      .save(outputFilename);
  });
}
