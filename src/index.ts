#!/usr/bin/env node

import compression from "compression";
import express, {Request, Response} from "express";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import process from "node:process";

const devmode = (process.env.NODE_ENV || "development") === "development";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
type dirtype = Map<string, dirtype | string>;
async function getDirectories(path: string): Promise<dirtype> {
	return new Map(
		await Promise.all(
			(await fs.readdir(path)).map(async function (file): Promise<[string, string | dirtype]> {
				if ((await fs.stat(path + "/" + file)).isDirectory()) {
					return [file, await getDirectories(path + "/" + file)];
				} else {
					return [file, file];
				}
			}),
		),
	);
}
let dirs: dirtype | undefined = undefined;
async function combinePath(path: string, tryAgain = true): Promise<string> {
	if (!dirs) {
		dirs = await getDirectories(__dirname);
	}
	const pathDir = path
		.split("/")
		.reverse()
		.filter((_) => _ !== "");
	function find(arr: string[], search: dirtype | string | undefined): boolean {
		if (search == undefined) return false;
		if (arr.length === 0) {
			return typeof search == "string";
		}
		if (typeof search == "string") {
			return false;
		}
		const thing = arr.pop() as string;
		return find(arr, search.get(thing));
	}
	if (find(pathDir, dirs)) {
		return __dirname + path;
	} else {
		if (!path.includes(".")) {
			const str = await combinePath(path + ".html", false);
			if (str !== __dirname + "/webpage/index.html") {
				return str;
			}
		}
		if (devmode && tryAgain) {
			dirs = await getDirectories(__dirname);
			return combinePath(path, false);
		}
		return __dirname + "/webpage/index.html";
	}
}

const app = express();

app.use(compression());

app.use("/getupdates", async (_req: Request, res: Response) => {
	try {
		const stats = await fs.stat(path.join(__dirname, "webpage"));
		res.send(stats.mtimeMs.toString());
	} catch (error) {
		console.error("Error getting updates:", error);
		res.status(500).send("Error getting updates");
	}
});

app.use("/", async (req: Request, res: Response) => {
	if (req.path === "/") {
		res.sendFile(path.join(__dirname, "webpage", "index.html"));
		return;
	}

	if (req.path.startsWith("/invite/")) {
		res.sendFile(path.join(__dirname, "webpage", "invite.html"));
		return;
	}
	const filePath = await combinePath("/webpage/" + req.path);
	res.sendFile(filePath);
});

app.set("trust proxy", (ip: string) => ip.startsWith("127."));

const PORT = process.env.PORT || Number(process.argv[2]) || 8081;
app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});
