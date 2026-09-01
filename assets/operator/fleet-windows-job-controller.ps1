$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class RepoHarnessFleetJob {
  [StructLayout(LayoutKind.Sequential)]
  public struct BasicLimitInformation {
    public long PerProcessUserTimeLimit;
    public long PerJobUserTimeLimit;
    public UInt32 LimitFlags;
    public UIntPtr MinimumWorkingSetSize;
    public UIntPtr MaximumWorkingSetSize;
    public UInt32 ActiveProcessLimit;
    public UIntPtr Affinity;
    public UInt32 PriorityClass;
    public UInt32 SchedulingClass;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct IoCounters {
    public ulong ReadOperationCount;
    public ulong WriteOperationCount;
    public ulong OtherOperationCount;
    public ulong ReadTransferCount;
    public ulong WriteTransferCount;
    public ulong OtherTransferCount;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct ExtendedLimitInformation {
    public BasicLimitInformation BasicLimitInformation;
    public IoCounters IoInfo;
    public UIntPtr ProcessMemoryLimit;
    public UIntPtr JobMemoryLimit;
    public UIntPtr PeakProcessMemoryUsed;
    public UIntPtr PeakJobMemoryUsed;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct BasicAccountingInformation {
    public long TotalUserTime;
    public long TotalKernelTime;
    public long ThisPeriodTotalUserTime;
    public long ThisPeriodTotalKernelTime;
    public UInt32 TotalProcesses;
    public UInt32 ActiveProcesses;
    public UInt32 TotalTerminatedProcesses;
  }

  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool TerminateJobObject(IntPtr job, uint exitCode);
  [DllImport("kernel32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool QueryInformationJobObject(IntPtr job, int informationClass, IntPtr information, uint length, IntPtr returnLength);
  [DllImport("kernel32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool SetInformationJobObject(IntPtr job, int informationClass, IntPtr information, uint length);
  [DllImport("kernel32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool CloseHandle(IntPtr handle);

  public static uint ActiveProcesses(IntPtr job) {
    int length = Marshal.SizeOf(typeof(BasicAccountingInformation));
    IntPtr bytes = Marshal.AllocHGlobal(length);
    try {
      if (!QueryInformationJobObject(job, 1, bytes, (uint)length, IntPtr.Zero)) {
        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
      }
      return ((BasicAccountingInformation)Marshal.PtrToStructure(bytes, typeof(BasicAccountingInformation))).ActiveProcesses;
    } finally {
      Marshal.FreeHGlobal(bytes);
    }
  }

  public static void ConfigureKillOnClose(IntPtr job) {
    ExtendedLimitInformation info = new ExtendedLimitInformation();
    info.BasicLimitInformation.LimitFlags = 0x00002000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    int length = Marshal.SizeOf(typeof(ExtendedLimitInformation));
    IntPtr bytes = Marshal.AllocHGlobal(length);
    try {
      Marshal.StructureToPtr(info, bytes, false);
      if (!SetInformationJobObject(job, 9, bytes, (uint)length)) {
        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
      }
    } finally {
      Marshal.FreeHGlobal(bytes);
    }
  }

  public static string QuoteArgument(string argument) {
    StringBuilder result = new StringBuilder();
    result.Append('"');
    int backslashes = 0;
    foreach (char current in argument) {
      if (current == '\\') {
        backslashes++;
      } else if (current == '"') {
        result.Append('\\', (backslashes * 2) + 1);
        result.Append('"');
        backslashes = 0;
      } else {
        result.Append('\\', backslashes);
        result.Append(current);
        backslashes = 0;
      }
    }
    result.Append('\\', backslashes * 2);
    result.Append('"');
    return result.ToString();
  }

  public static void ForwardCollectorOutput(object sender, DataReceivedEventArgs args) {
    if (args.Data == null) return;
    Console.Out.WriteLine(args.Data);
    Console.Out.Flush();
  }

  public static void DiscardCollectorError(object sender, DataReceivedEventArgs args) { }

  public static void BeginForwarding(Process process) {
    process.OutputDataReceived += ForwardCollectorOutput;
    process.ErrorDataReceived += DiscardCollectorError;
    process.BeginOutputReadLine();
    process.BeginErrorReadLine();
  }
}
'@

$job = [RepoHarnessFleetJob]::CreateJobObject([IntPtr]::Zero, $null)
if ($job -eq [IntPtr]::Zero) { throw 'CreateJobObject failed' }
[RepoHarnessFleetJob]::ConfigureKillOnClose($job)

function Write-Response([string]$type) {
  [Console]::Out.WriteLine((@{ type = $type } | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

function Wait-ForZeroActiveProcesses([IntPtr]$handle) {
  $deadline = [DateTime]::UtcNow.AddSeconds(5)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ([RepoHarnessFleetJob]::ActiveProcesses($handle) -eq 0) { return $true }
    Start-Sleep -Milliseconds 10
  }
  return ([RepoHarnessFleetJob]::ActiveProcesses($handle) -eq 0)
}

function Close-CleanJob([IntPtr]$handle, [bool]$terminate) {
  if ($terminate -and -not [RepoHarnessFleetJob]::TerminateJobObject($handle, 1)) {
    throw 'TerminateJobObject failed'
  }
  if (-not (Wait-ForZeroActiveProcesses $handle)) { return $false }
  if (-not [RepoHarnessFleetJob]::CloseHandle($handle)) { throw 'CloseHandle failed' }
  return $true
}

function Close-FailedJob([IntPtr]$handle) {
  if ($handle -eq [IntPtr]::Zero) { return }
  try { [void][RepoHarnessFleetJob]::TerminateJobObject($handle, 1) } catch { }
  try { [void](Wait-ForZeroActiveProcesses $handle) } catch { }
  try { [void][RepoHarnessFleetJob]::CloseHandle($handle) } catch { }
}

function Stop-ExactCollector([System.Diagnostics.Process]$process) {
  # Assignment can fail after Start. This Process instance keeps the exact
  # handle the controller created, so no PID can be recycled into cleanup.
  try {
    if ($process.HasExited) { return $true }
  } catch {
    # Start never succeeded, so no child process identity exists to reclaim.
    return $true
  }
  try { $process.Kill() } catch { }
  $deadline = [DateTime]::UtcNow.AddSeconds(5)
  while ([DateTime]::UtcNow -lt $deadline) {
    try {
      if ($process.WaitForExit(10) -or $process.HasExited) { return $true }
    } catch {
      return $false
    }
  }
  try { return $process.HasExited } catch { return $false }
}

$assigned = $false
$closed = $false
$collector = $null
try {
  while ($null -ne ($line = [Console]::In.ReadLine())) {
    $request = $null
    try { $request = $line | ConvertFrom-Json -ErrorAction Stop } catch { Write-Response 'cleanup_failed'; break }
    if ($null -eq $request -or $null -eq $request.type) { Write-Response 'cleanup_failed'; break }
    if (-not $assigned) {
      if ($request.type -ne 'launch' -or $null -eq $request.executable -or $null -eq $request.collector_path) {
        Write-Response 'cleanup_failed'
        break
      }
      $startInfo = New-Object System.Diagnostics.ProcessStartInfo
      $startInfo.FileName = [string]$request.executable
      $startInfo.Arguments = [RepoHarnessFleetJob]::QuoteArgument([string]$request.collector_path)
      $startInfo.UseShellExecute = $false
      $startInfo.RedirectStandardInput = $true
      $startInfo.RedirectStandardOutput = $true
      $startInfo.RedirectStandardError = $true
      $startInfo.CreateNoWindow = $true
      $collector = New-Object System.Diagnostics.Process
      $collector.StartInfo = $startInfo
      $started = $false
      try { $started = $collector.Start() } catch { $started = $false }
      if (-not $started) {
        Write-Response 'cleanup_failed'
        break
      }
      if ($collector.HasExited) {
        if (-not (Stop-ExactCollector $collector)) { throw 'collector exited before assignment but could not be reaped' }
        Write-Response 'cleanup_failed'
        break
      }
      # This is the exact kernel handle returned for the child this controller
      # created. No PID is ever accepted or reopened across this boundary.
      if (-not [RepoHarnessFleetJob]::AssignProcessToJobObject($job, $collector.Handle)) {
        if (-not (Stop-ExactCollector $collector)) { throw 'collector assignment failed and exact collector did not exit' }
        Write-Response 'cleanup_failed'
        break
      }
      [RepoHarnessFleetJob]::BeginForwarding($collector)
      $assigned = $true
      Write-Response 'assigned'
      continue
    }
    if ($request.type -eq 'start' -or $request.type -eq 'cancel') {
      try {
        $collector.StandardInput.WriteLine(($request | ConvertTo-Json -Compress -Depth 8))
        $collector.StandardInput.Flush()
      } catch {
        Write-Response 'cleanup_failed'
        break
      }
      continue
    }
    if ($request.type -eq 'terminate') {
      if (Close-CleanJob $job $true) { $closed = $true; Write-Response 'cleanup_ack'; break }
      Write-Response 'cleanup_failed'
      break
    }
    if ($request.type -eq 'cleanup') {
      if (Close-CleanJob $job $false) { $closed = $true; Write-Response 'cleanup_ack'; break }
      Write-Response 'cleanup_failed'
      break
    }
    Write-Response 'cleanup_failed'
    break
  }
} finally {
  if (-not $closed) { Close-FailedJob $job }
  if ($null -ne $collector) {
    if (-not $assigned -and -not (Stop-ExactCollector $collector)) {
      throw 'exact collector did not exit before controller shutdown'
    }
    try { $collector.Dispose() } catch { }
  }
}
