import { I18n } from "../i18n";
import { downloadBuffer } from "../utils/utils";

const enum compMethod {
	none = 0,
	deflate = 8,
}

const CRCTable = new Uint32Array(256);
let crc32 = 1;
for (let i = 128; i; i >>>= 1) {
	crc32 = (crc32 >>> 1) ^ (crc32 & 1 ? 0xedb88320 : 0);
	for (let j = 0; j < 256; j += 2 * i) CRCTable[i + j] = crc32 ^ CRCTable[j];
}

function CRC32(data: Uint8Array): number {
	let crc32 = 0xffffffff;

	for (const byte of data) {
		crc32 ^= byte;
		crc32 = ((crc32 >>> 8) ^ CRCTable[crc32 & 0xff]) >>> 0;
	}

	crc32 ^= 0xffffffff;
	return crc32 >>> 0;
}

class ZipFile {
	compMethod: compMethod;
	lastTime: number;
	lastDate: number;
	crc32: number;
	compSize: number;
	uncompSize: number;
	flags:number;
	private fileBuff: Uint8Array<ArrayBuffer>;
	private nameBuf: Uint8Array<ArrayBuffer>;
	private extraBuff: Uint8Array<ArrayBuffer>;
	constructor(view: DataView<ArrayBuffer>, offset: number, par: CentDir) {
		const magic = view.getInt32(offset, true);
		if (magic !== 0x4034b50) {
			throw new Error(I18n.zip.invalidZip());
		}
		//const ver = view.getInt16(offset + 4, true);
		this.flags = view.getInt16(offset + 6, true);
		const method = view.getInt16(offset + 8, true);
		this.compMethod = method as compMethod;

		this.lastTime = view.getInt16(offset + 10, true);
		this.lastDate = view.getInt16(offset + 12, true);

		this.crc32 = view.getUint32(offset + 14, true) || par.crc32;

		this.compSize = view.getInt32(offset + 18, true) || par.compressedSize;
		this.uncompSize = view.getInt32(offset + 22, true) || par.uncompressedSize;

		const nameLen = view.getInt16(offset + 26, true);
		const extraLen = view.getInt16(offset + 28, true);
		this.nameBuf = new Uint8Array(view.buffer, offset + 30, nameLen);
		this.extraBuff = new Uint8Array(view.buffer, offset + nameLen + 30, extraLen);

		this.fileBuff = new Uint8Array(view.buffer, offset + nameLen + 30 + extraLen, this.compSize);
	}
	get isDir() {
		return this.uncompSize === 0 && this.compSize === 0;
	}
	checkFile(file: Uint8Array) {
		if (CRC32(file) !== this.crc32) throw new Error(I18n.zip.crcNoMatch(this.name));
		return file;
	}
	async getFile() {
		if (this.isDir) {
			throw new Error("Internal Error: Tried to access a directory");
		}
		if (this.uncompSize === 0 || this.compSize === 0) {
			return new Uint8Array(0);
		}
		if (this.compMethod === compMethod.none) {
			return this.checkFile(this.fileBuff);
		} else if (this.compMethod === compMethod.deflate) {
			const decomp = new DecompressionStream("deflate-raw");
			const buff = new Uint8Array(this.uncompSize);
			const prom = (async () => {
				let i = 0;
				for await (const thing of decomp.readable) {
					buff.set(thing, i);
					i += thing.length;
				}
			})();
			const writer = decomp.writable.getWriter();
			await writer.write(this.fileBuff);
			await writer.close();
			await prom;
			return this.checkFile(buff);
		}
		this.compMethod satisfies never;
		throw new Error(I18n.zip.badCompMethod());
	}
	get name() {
		return guessText(this.nameBuf);
	}
	get extra(){
		return guessText(this.extraBuff);
	}
}
function guessText(buff: Uint8Array) {
	const newBuff = new Uint8Array([...buff]);
	return new TextDecoder().decode(newBuff.buffer)||"";
}
class CentDir {
	verMade: number;
	verExt: number;
	flags: number;
	method: compMethod;
	crc32: number;
	compressedSize: number;
	uncompressedSize: number;
	nextByte: number;

	private commentBuf: Uint8Array<ArrayBuffer>;
	private nameBuf: Uint8Array<ArrayBuffer>;
	private extraBuff: Uint8Array<ArrayBuffer>;

	file: ZipFile;
	constructor(view: DataView<ArrayBuffer>, centLoc: number) {
		const magic = view.getInt32(centLoc);
		if (magic !== 0x504b0102) throw new Error(I18n.zip.invalidZip());
		this.verMade = view.getInt16(centLoc + 4, true);

		this.verExt = view.getInt16(centLoc + 6, true);

		this.flags = view.getInt32(centLoc + 8, true);

		this.method = view.getInt16(centLoc + 10, true);

		this.crc32 = view.getUint32(centLoc + 16, true);

		this.compressedSize = view.getInt32(centLoc + 20, true);
		this.uncompressedSize = view.getInt32(centLoc + 24, true);

		const nameLen = view.getInt16(centLoc + 28, true);
		const extraLen = view.getInt16(centLoc + 30, true);
		const comLen2 = view.getInt16(centLoc + 32, true);

		const fileOff = view.getInt32(centLoc + 42, true);
		this.file = new ZipFile(view, fileOff, this);

		this.nameBuf = new Uint8Array(view.buffer, centLoc + 46, nameLen);
		this.extraBuff = new Uint8Array(view.buffer, centLoc + 46 + nameLen, extraLen);
		this.commentBuf = new Uint8Array(view.buffer, centLoc + 46 + nameLen + extraLen, comLen2);

		this.nextByte = centLoc + 46 + nameLen + extraLen + comLen2;
	}
	toString() {
		return this.name + " " + this.uncompressedSize + ":" + this.compressedSize;
	}
	get name() {
		return guessText(this.nameBuf);
	}
	get comment() {
		return guessText(this.commentBuf);
	}
	get extra() {
		return guessText(this.extraBuff);
	}
}
type fileStructure = {[key: string]: CentDir | fileStructure};
function breakPath(str: string) {
	const matches = [...str.matchAll(/(([^\/"]+)|"([^"\\]|\\")+")/gm)];
	const names = matches
		.map((_) => _[1])
		.map((name) => {
			if (name.startsWith('"')) return JSON.parse(name);
			return name;
		})
		.filter((_) => _);
	return names;
}
function combineBuffers(buffers:ArrayBufferLike[]){
	const len = buffers.reduce((c,b)=>c+b.byteLength,0);
	const buff = new Uint8Array(len);
	let i = 0;
	for(const b of buffers){
		buff.set(new Uint8Array(b),i);
		i+=b.byteLength
	}
	return buff.buffer;
}
export class Zip {
	records: number;
	private commentBuf: Uint8Array<ArrayBuffer>;
	dirs: CentDir[] = [];

	fileStructure: fileStructure = {};

	constructor(buff: ArrayBuffer) {
		const view = new DataView(buff);
		const start = this.findStart(view);
		this.records = view.getInt16(start + 8, true);

		const comLen = view.getInt16(start + 20, true);
		this.commentBuf = new Uint8Array(buff, start + 22, comLen);

		let centLoc = view.getInt32(start + 16, true);
		for (let i = 0; i < this.records; i++) {
			const dir = new CentDir(view, centLoc);
			centLoc = dir.nextByte;
			this.dirs.push(dir);
		}
		function placeFile(file: CentDir | undefined, p: fileStructure, path: string[]) {
			if (path.length === 1) {
				if (file) p[path[0]] = file;
				return;
			}
			const cur = (p[path[0]] ??= {}) as fileStructure;
			if (path.length === 2) {
				if (file) cur[path[1]] = file;
			} else {
				path.shift();
				placeFile(file, cur, path);
			}
		}

		for (const dir of this.dirs) {
			placeFile(dir.file.isDir ? undefined : dir, this.fileStructure, breakPath(dir.name));
		}
	}
	findStart(view: DataView) {
		for (let i = view.byteLength - 4; i > 0; i--) {
			const val = view.getInt32(i);
			if (val === 0x504b0506) {
				return i;
			}
		}
		return -1;
	}
	toString() {
		let build = "";
		for (const thing of this.dirs) {
			build += "\n" + thing.toString();
		}
		return build;
	}
	async getFile(name: string) {
		for (const dir of this.dirs) {
			if (dir.name === name) {
				return dir.file.getFile();
			}
		}
		return undefined;
	}
	get comment(){
		return guessText(this.commentBuf);
	}
	static async compress(buff:ArrayBuffer){
		const decomp = new CompressionStream("deflate-raw");
		const ars :ArrayBufferLike[]=[] ;
		const prom = (async () => {
			for await (const thing of decomp.readable) {
				ars.push(thing.buffer);
			}
		})();
		const writer = decomp.writable.getWriter();
		await writer.write(buff);
		await writer.close();
		await prom;
		return combineBuffers(ars);
	}
	static async zip(dir: FileSystemDirectoryHandle,baseDir=""): Promise<ArrayBuffer> {
		const files: Record<string, FileSystemFileHandle | undefined> = {};
		async function getFiles(dir: FileSystemDirectoryHandle, soFar: string = baseDir) {
			const entries = dir.entries();
			for await (let [name, handle] of entries) {
				if (name.includes(" ") || name.includes("/") || name.includes("\\")) {
					name = `"${name.replaceAll("\\", "\\\\").replaceAll("/", "\/").replaceAll('"', '\\"')}"`;
				}
				const place = soFar ? soFar + "/" + name : name;
				if (handle instanceof FileSystemFileHandle) {
					files[place] = handle;
				} else if (handle instanceof FileSystemDirectoryHandle) {
					files[place+"/"] = undefined;
					await getFiles(handle, place);
				}
			}
		}
		await getFiles(dir);
		const buffs: ArrayBufferLike[] = [];
		let i = 0;
		function addBuff(buff: ArrayBuffer) {
			buffs.push(buff);
			i += buff.byteLength;
		}
		interface fileInfo{
			entry:number,
			crc:number,
			mode:compMethod,
			compSize:number,
			realSize:number
		};
		const fileMap = new Map<string, fileInfo>();
		for (const [name, handle] of Object.entries(files)) {

			const entry = i ;
			const buff = new ArrayBuffer(30);
			const descriptor = new DataView(buff);

			const nameBuff = new TextEncoder().encode(name);

			const file = await (await handle?.getFile())?.arrayBuffer();
			descriptor.setInt32(0, 0x504b0304);
			descriptor.setInt16(4,20,true);


			const mode = handle ? compMethod.deflate : compMethod.none;
			descriptor.setInt16(8, mode,true);
			let crc = 0;
			let compSize =0;
			let realSize=0;
			//TODO set last date/time
			const comp = file && await this.compress(file);
			if (file && comp) {
				descriptor.setInt32(14, crc=CRC32(new Uint8Array(file)),true);


				descriptor.setInt32(18,compSize=comp.byteLength,true);
				descriptor.setInt32(22,realSize=file.byteLength,true);
			}
			descriptor.setInt32(26,nameBuff.length,true);
			addBuff(buff);
			addBuff(nameBuff.buffer)
			if(comp) addBuff(comp);
			fileMap.set(name,{
				entry,
				crc,
				mode,
				realSize,
				compSize
			})
		}
		const startOfCDFH = i;
		for(const [name, info] of fileMap){
			const buff = new ArrayBuffer(46);
			const descriptor = new DataView(buff);
			descriptor.setInt32(0, 0x504B0102);
			descriptor.setInt16(4,20,true);
			descriptor.setInt16(6,20,true);
			descriptor.setInt16(10,info.mode,true);
			//TODO deal with last modified stats
			descriptor.setInt32(16,info.crc,true);
			descriptor.setInt32(20,info.compSize,true);
			descriptor.setInt32(24,info.realSize,true);
			const nameBuff = new TextEncoder().encode(name);
			descriptor.setInt32(28,nameBuff.length,true);
			descriptor.setInt32(42,info.entry,true);
			addBuff(buff);
			addBuff(nameBuff.buffer);
		}
		const buff = new ArrayBuffer(22);
		const endOfFile = new DataView(buff);
		endOfFile.setInt32(0,0x504B0506);
		const entries = Object.keys(files).length;
		endOfFile.setInt16(8,entries,true);
		endOfFile.setInt16(10,entries,true);
		endOfFile.setInt32(12,i-startOfCDFH,true);
		endOfFile.setInt32(16,startOfCDFH,true);
		addBuff(buff);
		return combineBuffers(buffs);
	}
}
const buff = await Zip.zip(await navigator.storage.getDirectory());
const dir = new Zip(buff);
console.log(dir, buff);
console.log(dir.toString());
const cont = await dir.getFile("projects/test4/main.asm");
if (cont) {
	console.log(cont);
	console.log(guessText(cont));
}
downloadBuffer(buff,"zip.zip")

fetch("./ziputils/tetris.zip").then(async (res) => {
	const buff = await res.arrayBuffer();
	const dir = new Zip(buff);
	console.log(dir);

});

