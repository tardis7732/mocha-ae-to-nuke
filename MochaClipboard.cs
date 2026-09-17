using System;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

// No visible window, network access, or PowerShell dependency.
internal static class MochaClipboard
{
    [DllImport("user32.dll", SetLastError=true)] static extern bool OpenClipboard(IntPtr owner);
    [DllImport("user32.dll")] static extern bool CloseClipboard();
    [DllImport("user32.dll")] static extern bool EmptyClipboard();
    [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetClipboardData(uint format, IntPtr data);
    [DllImport("user32.dll")] static extern IntPtr GetClipboardData(uint format);
    [DllImport("kernel32.dll")] static extern IntPtr GlobalAlloc(uint flags, UIntPtr size);
    [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr handle);
    [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr handle);
    [DllImport("kernel32.dll")] static extern IntPtr GlobalFree(IntPtr handle);
    static void Open(IntPtr owner)
    {
        for (int i=0; i<30; i++) { if (OpenClipboard(owner)) return; Thread.Sleep(50); }
        throw new IOException("Clipboard is busy ("+Marshal.GetLastWin32Error()+").");
    }
    static string ReadClipboard()
    {
        Open(IntPtr.Zero);
        try {
            IntPtr h=GetClipboardData(13);
            if (h==IntPtr.Zero) return "";
            IntPtr p=GlobalLock(h);
            if (p==IntPtr.Zero) throw new IOException("Cannot read clipboard memory.");
            try { return Marshal.PtrToStringUni(p); } finally { GlobalUnlock(h); }
        } finally { CloseClipboard(); }
    }
    static void WriteClipboard(string text)
    {
        byte[] bytes=Encoding.Unicode.GetBytes(text+"\0");
        IntPtr handle=GlobalAlloc(0x42,(UIntPtr)bytes.Length);
        if(handle==IntPtr.Zero) throw new IOException("Cannot allocate clipboard memory.");
        var owner=new NativeWindow();
        try {
            IntPtr memory=GlobalLock(handle);
            if(memory==IntPtr.Zero) throw new IOException("Cannot lock clipboard memory.");
            try { Marshal.Copy(bytes,0,memory,bytes.Length); } finally { GlobalUnlock(handle); }
            owner.CreateHandle(new CreateParams());
            Open(owner.Handle);
            try {
                if (!EmptyClipboard()) throw new IOException("Cannot clear clipboard.");
                if(SetClipboardData(13,handle)==IntPtr.Zero) throw new IOException("Cannot set clipboard text.");
                handle=IntPtr.Zero; // Windows owns the memory until the next copy.
            } finally { CloseClipboard(); }
        } finally {
            if(owner.Handle!=IntPtr.Zero) owner.DestroyHandle();
            if(handle!=IntPtr.Zero) GlobalFree(handle);
        }
    }
    [STAThread] static int Main(string[] args)
    {
        try {
            if(args.Length<2 || !Regex.IsMatch(args[1],"^[0-9_]{8,80}$")) throw new ArgumentException("Invalid request.");
            string dir=Path.Combine(Path.GetTempPath(),"MochaNukeClipboard");
            string path=Path.Combine(dir,args[1]+".bin");
            switch(args[0]) {
            case "begin":
                Directory.CreateDirectory(dir);
                using(var f=new FileStream(path,FileMode.CreateNew,FileAccess.Write)) {}
                Console.WriteLine("READY"); return 0;
            case "append":
                if(args.Length!=4) throw new ArgumentException("Invalid chunk.");
                long offset=long.Parse(args[2],System.Globalization.CultureInfo.InvariantCulture);
                byte[] chunk=Convert.FromBase64String(args[3]);
                using(var f=new FileStream(path,FileMode.Open,FileAccess.Write,FileShare.None)) {
                    if(f.Length!=offset) throw new IOException("Tracking chunk offset mismatch.");
                    if(f.Length+chunk.Length>128*1024*1024) throw new IOException("Tracking data is too large.");
                    f.Position=f.Length; f.Write(chunk,0,chunk.Length); f.Flush();
                }
                Console.WriteLine("APPENDED:"+(offset+chunk.Length)); return 0;
            case "copy":
            case "verify":
                if(args.Length!=3) throw new ArgumentException("Missing expected data length.");
                byte[] data=File.ReadAllBytes(path);
                if(data.Length==0 || data.Length%2!=0 || data.Length!=long.Parse(args[2])) throw new IOException("Tracking data length mismatch.");
                string text=Encoding.Unicode.GetString(data);
                if(!text.StartsWith("# Mocha AE") || text.IndexOf('\0')>=0) throw new IOException("Invalid tracking payload.");
                if(args[0]=="copy") WriteClipboard(text);
                if(!String.Equals(ReadClipboard(),text,StringComparison.Ordinal)) throw new IOException("Clipboard does not match tracking data.");
                Console.WriteLine((args[0]=="copy"?"COPIED:":"VERIFIED:")+data.Length); return 0;
            case "cleanup":
                if(File.Exists(path)) File.Delete(path);
                Console.WriteLine("CLEANED"); return 0;
            default: throw new ArgumentException("Unknown request.");
            }
        } catch(Exception e) { Console.WriteLine("ERROR:"+e.Message); return 1; }
    }
}
