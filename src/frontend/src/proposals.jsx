import {HeadBar, Loading, ButtonWithLoading, timeAgo, token, userList, percentage, FileUploadInput} from "./common";
import * as React from "react";
import {Content} from "./content";
import {HourGlass, NotFound} from "./icons";
import {PostFeed} from "./post_feed";

const REPO_RELEASE = "https://github.com/TaggrNetwork/taggr/releases/latest";
const REPO_COMMIT = "https://github.com/TaggrNetwork/taggr/commit";

export const Proposals = () => {
    const [showMask, toggleMask] = React.useState(false);
    const [binary, setBinary] = React.useState(null);
    const [commit, setCommit] = React.useState("");
    const [proposal, setProposal] = React.useState(null);
    const [description, setDescription] = React.useState("");

    return <>
        <HeadBar title="Proposals" shareLink="proposals" menu={true}
            content={<div className="row_container">
                <ButtonWithLoading classNameArg="max_width_col" label="FUNDING" onClick={async () => {
                    let receiver = prompt("Enter the principal of the receiver.");
                    if (!receiver) return;
                    let amount = parseInt(prompt(`Enter the token amount (max. allowed amount is ${backendCache.config.max_funding_amount.toLocaleString()})`));
                    let description = prompt("Enter the proposal description.");
                    let response = await api.call("propose_funding", description, receiver, amount);
                    if ("Err" in response) {
                        alert(`Error: ${response.Err}`);
                    }
                    setProposal(response.Ok);
                }} />
                <button className="max_width_col active" onClick={() => toggleMask(!showMask)}>RELEASE</button>
            </div>} />
        <div className="vertically_spaced">
            {showMask && <div className="spaced column_container monospace">
                <div className="vcentered bottom_half_spaced">COMMIT<input type="text" className="monospace left_spaced max_width_col" onChange={async ev => { setCommit(ev.target.value); }} /></div>
                <div className="vcentered bottom_half_spaced">BINARY <FileUploadInput classNameArg="monospace left_spaced max_width_col" callback={setBinary} /></div>
                <div className="bottom_half_spaced monospace">DESCRIPTION</div>
                <textarea className="monospace bottom_spaced" rows={10} value={description} onChange={event => setDescription(event.target.value)}></textarea>
                {description && <Content value={description} preview={true} classNameArg="bottom_spaced framed" />}
                <ButtonWithLoading classNameArg="active" onClick={async () => {
                    if (!description || !binary) {
                        alert("Error: incomplete data.");
                        return;
                    }
                    const response = await api.propose_release(description, commit, binary);
                    if ("Err" in response) {
                        alert(`Error: ${response.Err}`);
                        return;
                    }
                    toggleMask(!showMask);
                    setProposal(response.Ok);
                }} label="SUBMIT" />
            </div>}
        </div>
        <PostFeed heartbeat={proposal} feedLoader={async page => await api.query("proposals", page)} />
    </>;
}

export const Proposal = ({id}) => {
    const users = backendCache.users;
    const [proposal, setProposal] = React.useState(null);
    const [status, setStatus] = React.useState("");

    const loadState = async () => {
        const result = await api.query("proposal", id);
        if ("Err" in result ) {
            setProposal(404);
        }
        setProposal(result.Ok);
        return result.Ok;
    };

    React.useEffect(() => { loadState(); }, []);

    if (!proposal) return <Loading />;
    if (proposal == 404) return <NotFound />;

    const statusEmoji = status => { return {"OPEN": "✨", "REJECTED": "🟥", "CANCELLED": "❌", "EXECUTED": "✅" }[status] || <HourGlass /> };

    const vote = async (proposal, adopted) => {
        if ("Release" in proposal.payload && adopted) {
            const hash = prompt("Please enter the build hash:");
            if (!hash) return;
            if (proposal.payload.Release.hash != hash) {
                alert("Error: wrong hash!");
                return;
            }
        }
        let proposal_id = proposal.id;
        const prevStatus = proposal.status;
        const result = await api.call("vote_on_proposal", proposal_id, adopted);
        if ("Err" in result) {
            setStatus(`Error: ${result.Err}`);
            return;
        }
        const data = await loadState();
        const newStatus = data.status;
        if (prevStatus == "Open" && newStatus == "Executed" && "Release" in data.payload) {
            setStatus("Executing the upgrade...");
            await api.call("execute_upgrade", true);
            setStatus("Finalizing the upgrade...");
            let result = await api.call("finalize_upgrade", data.payload.Release.hash);
            if ("Ok" in result) {
                setStatus(newStatus.toUpperCase());
                await loadState();
            } else {
                setStatus(`Upgrade execution failed: ${result.Err}`);
            }
        }
    };

    const voted = !api._user || proposal.bulletins.some(vote => api._user.id == vote[0]);
    const adopted = proposal.bulletins.reduce((acc, [_, adopted, votes]) => adopted ? acc + votes : acc, 0);
    const rejected = proposal.bulletins.reduce((acc, [_, adopted, votes]) => !adopted ? acc + votes : acc, 0);
    const open = proposal.status == "Open";
    const commit = proposal.payload.Release ? chunks(proposal.payload.Release.commit).join(" ") : null;
    const hash = proposal.payload.Release ? chunks(proposal.payload.Release.hash).join(" ") : null;
    const dailyDrop = proposal.voting_power / 100;
    const t = backendCache.config.proposal_approval_threshold;
    const days = Math.ceil((proposal.voting_power - (adopted > rejected ? adopted / t : rejected / (100 - t)) * 100) / dailyDrop);
    const propStatus = status ? status : proposal.status.toUpperCase();
    return <div key={proposal.timestamp} className="post_extension column_container">
        <div className="monospace bottom_half_spaced">ID: <code>{proposal.id}</code></div>
        <div className="monospace bottom_half_spaced">TYPE: {Object.keys(proposal.payload)[0].toUpperCase()}</div>
        <div className="monospace bottom_half_spaced">PROPOSER: <a href={`#/user/${proposal.proposer}`}>{`@${users[proposal.proposer]}`}</a></div>
        <div className="monospace bottom_half_spaced">DATE: {timeAgo(proposal.timestamp)}</div>
        <div className="monospace bottom_spaced">STATUS: {statusEmoji(propStatus)} <span className={open ? "accent" : null}>{propStatus}</span></div>
        {!!proposal.payload.Release && <div className="monospace bottom_spaced">
            {commit && <div className="row_container bottom_half_spaced">COMMIT:<a className="monospace left_spaced" href={open ? REPO_RELEASE : `${REPO_COMMIT}/${proposal.payload.Release.commit}`}>{commit}</a></div>}
            {!open && <div className="row_container"><span>HASH:</span><code className="left_spaced monospace">{hash}</code></div>}
        </div>}
        {!!proposal.payload.Fund && <>
            <div className="monospace bottom_half_spaced">RECEIVER: <code>{proposal.payload.Fund[0]}</code></div>
            <div className="monospace bottom_spaced">AMOUNT: <code>{proposal.payload.Fund[1].toLocaleString()}</code></div>
        </>}
        <div className="monospace bottom_spaced">
            EFFECTIVE VOTING POWER: <code>{token(proposal.voting_power)}</code>
        </div>
        {open && !isNaN(days) && <div className="monospace bottom_spaced">
            EXECUTION DEADLINE: <code>{days}</code> DAYS
        </div>}
        <div className="monospace bottom_spaced">
            <div className="bottom_half_spaced">ADOPTED: <b className={adopted > rejected && open ? "accent" : null}>{token(adopted)}</b> ({percentage(adopted, proposal.voting_power)})</div>
            <div className="small_text">{users && userList(proposal.bulletins.filter(vote => vote[1]).map(vote => vote[0]))}</div>
        </div>
        <div className="monospace bottom_spaced">
            <div className="bottom_half_spaced">REJECTED: <b className={adopted < rejected && open ? "accent" : null}>{token(rejected)}</b> ({percentage(rejected, proposal.voting_power)})</div>
            <div className="small_text">{users && userList(proposal.bulletins.filter(vote => !vote[1]).map(vote => vote[0]))}</div>
        </div>
        {api._user && open && !voted && <>
            <div className="row_container">
                <ButtonWithLoading onClick={() => vote(proposal, false)} classNameArg="max_width_col large_text" label="REJECT" />
                <ButtonWithLoading onClick={() => vote(proposal, true)} classNameArg="max_width_col large_text" label="ADOPT" />
            </div>
        </>}
        {api._user && api._user.id == proposal.proposer && open &&
            <ButtonWithLoading onClick={async () => {
                if (!confirm("Do you want to cancel your proposal?")) return;
                await api.call("cancel_proposal", proposal.id);
                location.reload();
            }} classNameArg="top_spaced max_width_col large_text" label="CANCEL" />}
    </div>;
};

const chunks = s => s ? [s.slice(0, 8)].concat(chunks(s.slice(8))) : [];
