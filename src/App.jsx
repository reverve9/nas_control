import React, { useState, useEffect } from 'react';
import { Folder, Palette, Video, Image, FileText, Table, Presentation, Music, Archive, FileCode, File } from 'lucide-react';
import './style.css';

// 파일 확장자별 아이콘 매핑
const getFileIcon = (filename, isDirectory) => {
  if (isDirectory) return <Folder size={18} strokeWidth={1.2} />;
  
  const ext = filename.split('.').pop().toLowerCase();
  
  // 디자인
  if (['psd', 'psb', 'ai', 'fig', 'sketch', 'xd'].includes(ext)) {
    return <Palette size={18} strokeWidth={1.2} />;
  }
  // 영상
  if (['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv'].includes(ext)) {
    return <Video size={18} strokeWidth={1.2} />;
  }
  // 이미지
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff'].includes(ext)) {
    return <Image size={18} strokeWidth={1.2} />;
  }
  // 문서
  if (['pdf', 'doc', 'docx', 'hwp', 'hwpx', 'txt', 'rtf'].includes(ext)) {
    return <FileText size={18} strokeWidth={1.2} />;
  }
  // 스프레드시트
  if (['xlsx', 'xls', 'csv', 'numbers'].includes(ext)) {
    return <Table size={18} strokeWidth={1.2} />;
  }
  // 프레젠테이션
  if (['pptx', 'ppt', 'key', 'indd'].includes(ext)) {
    return <Presentation size={18} strokeWidth={1.2} />;
  }
  // 오디오
  if (['mp3', 'wav', 'aac', 'flac', 'ogg'].includes(ext)) {
    return <Music size={18} strokeWidth={1.2} />;
  }
  // 압축
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return <Archive size={18} strokeWidth={1.2} />;
  }
  // 코드
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'html', 'css', 'json', 'php', 'rb', 'swift', 'kt'].includes(ext)) {
    return <FileCode size={18} strokeWidth={1.2} />;
  }
  // 기타
  return <File size={18} strokeWidth={1.2} />;
};

function App() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [config, setConfig] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [projectFolders, setProjectFolders] = useState([]);
  const [subfolders, setSubfolders] = useState([]);
  const [manualSelect, setManualSelect] = useState(false);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedSubfolder, setSelectedSubfolder] = useState('');
  const [customSubfolder, setCustomSubfolder] = useState('');
  
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [batchMode, setBatchMode] = useState(false);
  const [batchResults, setBatchResults] = useState([]);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  
  const [pendingFiles, setPendingFiles] = useState([]);
  const [showPendingView, setShowPendingView] = useState(false);

  useEffect(() => {
    const loadConfig = async () => {
      const cfg = await window.electronAPI.getConfig();
      setConfig(cfg);
      setCurrentPath(cfg.tempPath);
      loadDirectory(cfg.tempPath);
      
      const folders = await window.electronAPI.getProjectFolders();
      setProjectFolders(folders);
      
      const pending = await window.electronAPI.getPendingFiles();
      setPendingFiles(pending);
      if (pending.length > 0) {
        setShowPendingView(true);
      }
    };
    loadConfig();
    
    window.electronAPI.onShowPendingFiles((files) => {
      setPendingFiles(files);
      setShowPendingView(true);
    });
  }, []);

  useEffect(() => {
    const loadSubfolders = async () => {
      if (selectedProject) {
        const subs = await window.electronAPI.getSubfolders(selectedProject);
        setSubfolders(subs);
        setSelectedSubfolder('');
      } else {
        setSubfolders([]);
      }
    };
    loadSubfolders();
  }, [selectedProject]);

  const loadDirectory = async (path) => {
    setLoading(true);
    setSelectedFiles([]);
    try {
      const result = await window.electronAPI.readDirectory(path);
      if (result.error) {
        alert('폴더를 읽을 수 없습니다: ' + result.error);
        setFiles([]);
      } else {
        setFiles(result);
        setCurrentPath(path);
      }
    } catch (err) {
      alert('오류: ' + err.message);
    }
    setLoading(false);
  };

  const toggleFileSelection = (file) => {
    if (file.isDirectory) return;
    setSelectedFiles(prev => {
      const isSelected = prev.find(f => f.path === file.path);
      if (isSelected) {
        return prev.filter(f => f.path !== file.path);
      } else {
        return [...prev, file];
      }
    });
  };

  const toggleSelectAll = () => {
    const fileOnly = files.filter(f => !f.isDirectory);
    if (selectedFiles.length === fileOnly.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(fileOnly);
    }
  };

  const requestAIClassification = async (file) => {
    setSuggestion({
      file: file.name,
      filePath: file.path,
      loading: true
    });
    setManualSelect(false);
    setBatchMode(false);
    setShowPendingView(false);

    try {
      const result = await window.electronAPI.classifyFile(file.path);
      if (result.error) {
        setSuggestion({
          file: file.name,
          filePath: file.path,
          loading: false,
          error: result.error
        });
      } else {
        setSuggestion({
          file: file.name,
          filePath: file.path,
          loading: false,
          ...result
        });
        setSelectedProject(result.project);
        setSelectedSubfolder(result.subfolder);
      }
    } catch (err) {
      setSuggestion({
        file: file.name,
        filePath: file.path,
        loading: false,
        error: err.message
      });
    }
  };

  const markAsComplete = async (file) => {
    const result = await window.electronAPI.markComplete(file.path);
    if (!result.error) {
      setSuggestion({
        file: file.name,
        filePath: file.path,
        loading: false,
        ...result
      });
      setShowPendingView(false);
    }
  };

  const batchClassify = async (filesToClassify = null) => {
    const targetFiles = filesToClassify || selectedFiles;
    if (targetFiles.length === 0) {
      alert('파일을 선택해주세요.');
      return;
    }

    setBatchMode(true);
    setBatchProcessing(true);
    setBatchResults([]);
    setBatchProgress(0);
    setSuggestion(null);
    setShowPendingView(false);

    const results = [];
    for (let i = 0; i < targetFiles.length; i++) {
      const file = targetFiles[i];
      setBatchProgress(Math.round(((i + 1) / targetFiles.length) * 100));

      try {
        const result = await window.electronAPI.classifyFile(file.path);
        results.push({
          file: file.name,
          filePath: file.path,
          ...result,
          selected: true
        });
      } catch (err) {
        results.push({
          file: file.name,
          filePath: file.path,
          error: err.message,
          selected: false
        });
      }
      setBatchResults([...results]);
    }
    setBatchProcessing(false);
  };

  const classifyPendingFiles = () => {
    batchClassify(pendingFiles);
  };

  const toggleBatchResultSelection = (index) => {
    setBatchResults(prev => prev.map((r, i) => 
      i === index ? { ...r, selected: !r.selected } : r
    ));
  };

  const batchMove = async () => {
    const toMove = batchResults.filter(r => r.selected && !r.error && r.destPath);
    if (toMove.length === 0) {
      alert('이동할 파일이 없습니다.');
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const item of toMove) {
      const result = await window.electronAPI.moveFile(item.filePath, item.destPath);
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    alert(`완료!\n✓ 성공: ${successCount}개\n✗ 실패: ${failCount}개`);
    
    const pending = await window.electronAPI.getPendingFiles();
    setPendingFiles(pending);
    
    loadDirectory(currentPath);
    setBatchMode(false);
    setBatchResults([]);
    setSelectedFiles([]);
  };

  const moveFile = async () => {
    if (!suggestion) return;

    let destPath;
    if (manualSelect) {
      const subfolder = customSubfolder || selectedSubfolder;
      if (!selectedProject || !subfolder) {
        alert('프로젝트와 폴더를 선택해주세요.');
        return;
      }
      destPath = `${config.basePath}/${config.currentYear}/${selectedProject}/${subfolder}/${suggestion.file}`;
    } else if (suggestion.destPath) {
      destPath = suggestion.destPath;
    } else {
      alert('이동할 경로를 선택해주세요.');
      return;
    }

    const result = await window.electronAPI.moveFile(
      suggestion.filePath || suggestion.sourcePath,
      destPath
    );

    if (result.success) {
      alert('파일이 이동되었습니다!');
      const pending = await window.electronAPI.getPendingFiles();
      setPendingFiles(pending);
      loadDirectory(currentPath);
      setSuggestion(null);
      setManualSelect(false);
      setCustomSubfolder('');
    } else {
      alert('이동 실패: ' + result.error);
    }
  };

  const goUp = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/');
    if (parentPath) {
      loadDirectory(parentPath);
    }
  };

  const scanNow = async () => {
    const pending = await window.electronAPI.scanNow();
    setPendingFiles(pending);
    if (pending.length > 0) {
      setShowPendingView(true);
    } else {
      alert('정리할 파일이 없습니다.');
    }
  };

  const getConfidenceClass = (confidence) => {
    return `confidence ${confidence}`;
  };

  const getConfidenceText = (confidence) => {
    switch (confidence) {
      case 'high': return '높음';
      case 'medium': return '보통';
      case 'low': return '낮음';
      default: return '';
    }
  };

  const fileOnlyCount = files.filter(f => !f.isDirectory).length;

  return (
    <div className="container">
      {/* 헤더 */}
      <div className="header">
        <h1>
          <img src="./public/app-icon.png" alt="NC" className="header-logo" />
          NAS Control
        </h1>
        {pendingFiles.length > 0 && !showPendingView && (
          <span className="header-badge">{pendingFiles.length}개 대기</span>
        )}
      </div>

      {/* 알림 배너 */}
      {pendingFiles.length > 0 && !showPendingView && !batchMode && (
        <div className="alert-banner">
          <span>🔔 정리할 파일 {pendingFiles.length}개가 있습니다</span>
          <button className="btn btn-accent" onClick={() => setShowPendingView(true)}>
            확인하기
          </button>
        </div>
      )}

      {/* 경로 바 */}
      <div className="path-bar">
        <input
          type="text"
          className="path-input"
          value={currentPath}
          onChange={(e) => setCurrentPath(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadDirectory(currentPath)}
          placeholder="경로 입력"
        />
        <button className="btn btn-ghost" onClick={goUp}>상위</button>
        <button className="btn btn-secondary" onClick={() => loadDirectory(currentPath)}>새로고침</button>
        {config && (
          <button className="btn btn-primary" onClick={() => loadDirectory(config.tempPath)}>
            기본 폴더
          </button>
        )}
        <button className="btn btn-ghost" onClick={scanNow}>스캔</button>
      </div>

      {/* 대기 파일 뷰 */}
      {showPendingView && pendingFiles.length > 0 && (
        <div className="pending-view">
          <div className="pending-header">
            <h3>🔔 정리 대기 파일</h3>
            <button className="btn btn-ghost" onClick={() => setShowPendingView(false)}>닫기</button>
          </div>
          <div className="pending-list">
            {pendingFiles.map((file, idx) => (
              <div key={idx} className="pending-item">
                <div className="pending-info">
                  <strong>{file.name}</strong>
                  <span>{file.reason}</span>
                </div>
                <button className="btn btn-secondary" onClick={() => markAsComplete(file)}>
                  완료 처리
                </button>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" onClick={classifyPendingFiles}>
            전체 일괄 분류 ({pendingFiles.length}개)
          </button>
        </div>
      )}

      {/* 다중 선택 바 */}
      {fileOnlyCount > 0 && !showPendingView && (
        <div className="select-bar">
          <button className="btn btn-ghost" onClick={toggleSelectAll}>
            {selectedFiles.length === fileOnlyCount ? '전체 해제' : '전체 선택'}
          </button>
          <span>{selectedFiles.length}개 선택됨</span>
          {selectedFiles.length > 0 && (
            <button 
              className="btn btn-primary" 
              onClick={() => batchClassify()}
              disabled={batchProcessing}
            >
              일괄 분류 ({selectedFiles.length}개)
            </button>
          )}
        </div>
      )}

      {/* 파일 리스트 */}
      {loading ? (
        <div className="loading">로딩 중...</div>
      ) : !showPendingView && (
        <div className="file-list">
          {files.length === 0 ? (
            <div className="empty">파일이 없습니다</div>
          ) : (
            files.map((file, index) => {
              const isSelected = selectedFiles.find(f => f.path === file.path);
              return (
                <div key={index} className={`file-item ${isSelected ? 'selected' : ''}`}>
                  <div className="file-name">
                    {!file.isDirectory && (
                      <input 
                        type="checkbox"
                        checked={!!isSelected}
                        onChange={() => toggleFileSelection(file)}
                      />
                    )}
                    <span className="file-icon">
                      {getFileIcon(file.name, file.isDirectory)}
                    </span>
                    <span 
                      className={`file-label ${file.isDirectory ? 'clickable' : ''}`}
                      onClick={() => file.isDirectory && loadDirectory(file.path)}
                    >
                      {file.name}
                    </span>
                  </div>
                  {!file.isDirectory && (
                    <div className="file-actions">
                      <button className="btn btn-ghost" onClick={() => markAsComplete(file)}>
                        완료
                      </button>
                      <button className="btn btn-secondary" onClick={() => requestAIClassification(file)}>
                        분류
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 배치 결과 */}
      {batchMode && (
        <div className="suggestion-box">
          <h3>일괄 분류 결과</h3>
          
          {batchProcessing && (
            <>
              <p>분석 중... ({batchProgress}%)</p>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${batchProgress}%` }} />
              </div>
            </>
          )}

          {batchResults.length > 0 && (
            <>
              <div className="batch-results">
                {batchResults.map((result, idx) => (
                  <div key={idx} className={`batch-item ${!result.selected ? 'disabled' : ''}`}>
                    <input 
                      type="checkbox"
                      checked={result.selected}
                      onChange={() => toggleBatchResultSelection(idx)}
                      disabled={!!result.error}
                    />
                    <div className="batch-item-info">
                      <strong>{result.file}</strong>
                      {result.error ? (
                        <span className="error">오류: {result.error}</span>
                      ) : (
                        <span>
                          → {result.project}/{result.subfolder}
                          <span className={getConfidenceClass(result.confidence)} style={{ marginLeft: '8px' }}>
                            {getConfidenceText(result.confidence)}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {!batchProcessing && (
                <div className="suggestion-actions">
                  <button className="btn btn-primary" onClick={batchMove}>
                    일괄 이동 ({batchResults.filter(r => r.selected && !r.error).length}개)
                  </button>
                  <button className="btn btn-ghost" onClick={() => {
                    setBatchMode(false);
                    setBatchResults([]);
                  }}>
                    취소
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 단일 분류 결과 */}
      {suggestion && !batchMode && (
        <div className="suggestion-box">
          <h3>🤖 AI 분류 제안</h3>
          
          {suggestion.loading ? (
            <p>분석 중...</p>
          ) : suggestion.error ? (
            <>
              <p style={{ color: '#c62828' }}>오류: {suggestion.error}</p>
              <div className="suggestion-actions">
                <button className="btn btn-ghost" onClick={() => setSuggestion(null)}>닫기</button>
              </div>
            </>
          ) : (
            <>
              <p><strong>파일:</strong> {suggestion.file}</p>
              
              {!manualSelect ? (
                <>
                  <p><strong>추천 프로젝트:</strong> {suggestion.project}</p>
                  <p><strong>추천 폴더:</strong> {suggestion.subfolder}</p>
                  <p>
                    <strong>신뢰도:</strong>{' '}
                    <span className={getConfidenceClass(suggestion.confidence)}>
                      {getConfidenceText(suggestion.confidence)}
                    </span>
                  </p>
                  <p><strong>이유:</strong> {suggestion.reason}</p>
                  <div className="suggestion-path">{suggestion.destPath}</div>
                </>
              ) : (
                <>
                  <div className="select-group">
                    <label>프로젝트 선택</label>
                    <select 
                      className="select-input"
                      value={selectedProject}
                      onChange={(e) => setSelectedProject(e.target.value)}
                    >
                      <option value="">-- 선택 --</option>
                      {projectFolders.map((folder, idx) => (
                        <option key={idx} value={folder}>{folder}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="select-group">
                    <label>하위 폴더 선택</label>
                    <select 
                      className="select-input"
                      value={selectedSubfolder}
                      onChange={(e) => {
                        setSelectedSubfolder(e.target.value);
                        setCustomSubfolder('');
                      }}
                      disabled={!selectedProject}
                    >
                      <option value="">-- 선택 --</option>
                      {subfolders.map((folder, idx) => (
                        <option key={idx} value={folder}>{folder}</option>
                      ))}
                    </select>
                  </div>

                  <div className="select-group">
                    <label>또는 새 폴더 입력</label>
                    <input
                      type="text"
                      className="text-input"
                      value={customSubfolder}
                      onChange={(e) => {
                        setCustomSubfolder(e.target.value);
                        setSelectedSubfolder('');
                      }}
                      placeholder="새 폴더명 (자동 생성)"
                      disabled={!selectedProject}
                    />
                  </div>

                  {selectedProject && (customSubfolder || selectedSubfolder) && (
                    <div className="suggestion-path">
                      {config.basePath}/{config.currentYear}/{selectedProject}/{customSubfolder || selectedSubfolder}/{suggestion.file}
                    </div>
                  )}
                </>
              )}

              <div className="suggestion-actions">
                {!manualSelect ? (
                  <>
                    <button className="btn btn-primary" onClick={moveFile}>이동하기</button>
                    <button className="btn btn-secondary" onClick={() => setManualSelect(true)}>직접 선택</button>
                  </>
                ) : (
                  <>
                    <button 
                      className="btn btn-primary" 
                      onClick={moveFile}
                      disabled={!selectedProject || (!selectedSubfolder && !customSubfolder)}
                    >
                      이동하기
                    </button>
                    <button className="btn btn-secondary" onClick={() => setManualSelect(false)}>
                      AI 제안 보기
                    </button>
                  </>
                )}
                <button className="btn btn-ghost" onClick={() => {
                  setSuggestion(null);
                  setManualSelect(false);
                  setCustomSubfolder('');
                }}>
                  취소
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
