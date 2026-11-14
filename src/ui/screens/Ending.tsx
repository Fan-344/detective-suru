import { S } from '../strings';
import { SuruHeader } from '../suru/Suru';

interface Props {
  title: string;
  text: string[];
  onRestart(): void;
}

/** 結局：Suru 那一層的畫面。標題和內文都來自資料檔。 */
export function Ending({ title, text, onRestart }: Props) {
  return (
    <div className="suru ending">
      <SuruHeader title="SURU" />
      <div className="ending__scroll">
        <h1 className="ending__title">{title}</h1>
        {text.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <button className="suru-button" onClick={onRestart}>{S.endingRestart}</button>
    </div>
  );
}
